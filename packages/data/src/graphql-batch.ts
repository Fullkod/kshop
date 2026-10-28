import {
  Kind,
  parse,
  print,
  visit,
  type DefinitionNode,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type VariableDefinitionNode,
} from "graphql";

// Request batching for pg_graphql (admin and Kshop Admin). A screen used to send each of its reads as its own HTTP
// request: the product page sent the catalog structure and the product, the orders list its rows and the checkout
// settings, the global search three queries per keystroke. On Supabase each request may land on a different
// database connection, and the first pg_graphql query of a connection rebuilds the GraphQL schema (up to ~2 s on the
// Nano instance); several at once queue on its shared CPU and end in 57014 (statement timeout). The queries a
// screen starts in the same moment are now merged into ONE GraphQL operation (one request, one connection, one
// statement) and the result is split back, so every caller still gets exactly its own response.
//
// Merging is mechanical and safe: every root field of query i gets the alias `b{i}_<alias or name>`, its variables
// become `$b{i}_<name>` and its fragments `b{i}_<name>`. Identical requests in a batch are sent once.

export type GraphqlRequestBody = {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string | null;
};

type Merged = { query: string; variables: Record<string, unknown>; prefixes: string[] };

const prefix = (i: number) => `b${i}_`;

/** Only plain queries with fields at the root can be merged (no mutations, no root fragments). */
export function canBatch(body: GraphqlRequestBody): boolean {
  try {
    const doc = parse(body.query);
    const ops = doc.definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION);
    return (
      ops.length === 1 &&
      ops[0]!.operation === "query" &&
      ops[0]!.selectionSet.selections.every((s) => s.kind === Kind.FIELD)
    );
  } catch {
    return false;
  }
}

/** One operation with the root fields, variables and fragments of every request, renamed apart. */
export function mergeRequests(bodies: GraphqlRequestBody[]): Merged {
  const variableDefinitions: VariableDefinitionNode[] = [];
  const fields: FieldNode[] = [];
  const fragments: DefinitionNode[] = [];
  const variables: Record<string, unknown> = {};
  const prefixes: string[] = [];

  bodies.forEach((body, i) => {
    const p = prefix(i);
    prefixes.push(p);
    const renamed = visit(parse(body.query), {
      Variable: (node) => ({ ...node, name: { ...node.name, value: p + node.name.value } }),
      FragmentSpread: (node) => ({ ...node, name: { ...node.name, value: p + node.name.value } }),
      FragmentDefinition: (node) => ({ ...node, name: { ...node.name, value: p + node.name.value } }),
    }) as DocumentNode;
    for (const def of renamed.definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        fragments.push(def as FragmentDefinitionNode);
        continue;
      }
      if (def.kind !== Kind.OPERATION_DEFINITION) continue;
      variableDefinitions.push(...(def.variableDefinitions ?? []));
      for (const sel of def.selectionSet.selections) {
        const field = sel as FieldNode;
        fields.push({ ...field, alias: { kind: Kind.NAME, value: p + (field.alias?.value ?? field.name.value) } });
      }
    }
    for (const [name, value] of Object.entries(body.variables ?? {})) variables[p + name] = value;
  });

  const operation: OperationDefinitionNode = {
    kind: Kind.OPERATION_DEFINITION,
    operation: "query" as OperationDefinitionNode["operation"],
    name: { kind: Kind.NAME, value: "Batch" },
    variableDefinitions,
    directives: [],
    selectionSet: { kind: Kind.SELECTION_SET, selections: fields },
  };
  const document: DocumentNode = { kind: Kind.DOCUMENT, definitions: [operation, ...fragments] };
  return { query: print(document), variables, prefixes };
}

/** The data of request i: its prefixed root keys with the prefix removed. */
export function splitData(data: Record<string, unknown> | null | undefined, p: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (key.startsWith(p)) out[key.slice(p.length)] = value;
  }
  return out;
}

type Pending = {
  body: GraphqlRequestBody;
  key: string;
  url: string;
  init: RequestInit;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

/**
 * A fetch for urql that merges the queries started within `windowMs` into one request. Anything that cannot be
 * merged (mutations, odd documents) goes straight through. When the merged request returns GraphQL errors, the
 * requests are sent again one by one, so each caller gets its own errors and the others their data.
 */
export function createBatchingFetch(baseFetch: typeof fetch, { windowMs = 8, maxBatch = 10 } = {}): typeof fetch {
  let queue: Pending[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush(batch: Pending[]) {
    // Identical requests (same query and variables) are sent once.
    const unique = new Map<string, Pending[]>();
    for (const item of batch) unique.set(item.key, [...(unique.get(item.key) ?? []), item]);
    const groups = [...unique.values()];
    if (groups.length === 1) {
      const [first, ...same] = groups[0]!;
      try {
        const response = await baseFetch(first!.url, first!.init);
        if (!same.length) return first!.resolve(response);
        const text = await response.text();
        for (const item of groups[0]!) {
          item.resolve(new Response(text, { status: response.status, headers: response.headers }));
        }
      } catch (e) {
        for (const item of groups[0]!) item.reject(e);
      }
      return;
    }

    const merged = mergeRequests(groups.map((g) => g[0]!.body));
    const first = groups[0]![0]!;
    try {
      const response = await baseFetch(first.url, {
        ...first.init,
        body: JSON.stringify({ query: merged.query, variables: merged.variables }),
      });
      const text = await response.text();
      let payload: { data?: Record<string, unknown> | null; errors?: unknown[] } | null = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      if (!response.ok || !payload) {
        // Timeout, auth or server error: every caller sees the same failure (as if each had sent it).
        for (const group of groups) {
          for (const item of group) {
            item.resolve(new Response(text, { status: response.status, headers: response.headers }));
          }
        }
        return;
      }
      if (payload.errors?.length) {
        for (const group of groups) {
          const [one, ...same] = group;
          void baseFetch(one!.url, one!.init).then(
            async (r) => {
              const t = await r.text();
              for (const item of [one!, ...same]) item.resolve(new Response(t, { status: r.status, headers: r.headers }));
            },
            (e) => group.forEach((item) => item.reject(e)),
          );
        }
        return;
      }
      groups.forEach((group, i) => {
        const data = splitData(payload!.data, merged.prefixes[i]!);
        for (const item of group) item.resolve(jsonResponse({ data }));
      });
    } catch (e) {
      for (const group of groups) for (const item of group) item.reject(e);
    }
  }

  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: GraphqlRequestBody | null = null;
    try {
      body = typeof init?.body === "string" ? (JSON.parse(init.body) as GraphqlRequestBody) : null;
    } catch {
      body = null;
    }
    if (!body || !canBatch(body)) return baseFetch(input, init);

    return new Promise<Response>((resolve, reject) => {
      const item: Pending = {
        body,
        key: JSON.stringify([body.query, body.variables ?? {}]),
        url,
        init: init ?? {},
        resolve,
        reject,
      };
      // An aborted caller (unmounted screen) is dropped from the batch, the others carry on.
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      queue.push(item);
      if (queue.length >= maxBatch) {
        if (timer) clearTimeout(timer);
        timer = null;
        const batch = queue;
        queue = [];
        void flush(batch);
        return;
      }
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          const batch = queue;
          queue = [];
          void flush(batch);
        }, windowMs);
      }
    });
  };
}
