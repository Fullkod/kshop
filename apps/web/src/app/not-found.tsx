import { Brand } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Brand />
      <h1 className="text-3xl font-semibold">Página no encontrada</h1>
      <p className="text-muted-foreground">
        La dirección no existe o la tienda ya no está disponible. Revisa que esté bien escrita.
      </p>
    </main>
  );
}
