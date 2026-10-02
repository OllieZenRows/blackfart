import type { Metadata } from "next";
import { SymphonyStudio } from "../symphony/studio";
import "../symphony/symphony.css";

export const metadata: Metadata = {
  title: "EFM — Blackfart",
  description: "Electronic fart music. Build a smoother groove from six edited samples, change the rhythm, and download your mix.",
};

export default function EfmPage() {
  return <SymphonyStudio />;
}
