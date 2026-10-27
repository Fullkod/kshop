import { notFound } from "next/navigation";
import { UiSamples } from "./UiSamples";

// Atoms sample page (/admin/_ui, development only): compare with §02 of docs/design-v2/referencias/Tienda Biblioteca.
export default function UiSamplesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <UiSamples />;
}
