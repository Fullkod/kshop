import type { Metadata } from "next";
import { Suspense } from "react";
import { ListingPage } from "@/features/storefront/components/ListingPage";
import { requireStore, storeMetadata } from "@/server/storefront/page-helpers";

export async function generateMetadata({ params }: PageProps<"/s/[storeSlug]/search">): Promise<Metadata> {
  const store = await requireStore(params);
  // Result pages are not indexed (endless combinations); the listings are.
  return {
    ...storeMetadata(store, { title: "Buscar", path: "/search" }),
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: PageProps<"/s/[storeSlug]/search">) {
  const store = await requireStore(params);
  return (
    <ListingPage
      store={store}
      title="Buscar"
      basePath="/search"
      searchParams={searchParams}
      intro={
        <Suspense>
          <SearchBox searchParams={searchParams} />
        </Suspense>
      }
    />
  );
}

async function SearchBox({
  searchParams,
}: {
  searchParams: PageProps<"/s/[storeSlug]/search">["searchParams"];
}) {
  const q = (await searchParams).q;
  return (
    <form action="/search" role="search" className="flex max-w-xl gap-2">
      <label htmlFor="search-q" className="sr-only">
        ¿Qué buscas?
      </label>
      <input
        id="search-q"
        name="q"
        type="search"
        defaultValue={typeof q === "string" ? q : ""}
        placeholder="¿Qué buscas?"
        className="h-11 flex-1 rounded-[var(--sf-radius)] border bg-background px-4"
      />
      <button
        type="submit"
        className="h-11 rounded-[var(--sf-radius)] bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90"
      >
        Buscar
      </button>
    </form>
  );
}
