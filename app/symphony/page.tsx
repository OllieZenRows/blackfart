import type { Metadata } from "next";
import { SymphonyStudio } from "./studio";
import "./symphony.css";

export const metadata: Metadata = {
  title: "Fart Symphony — Blackfart",
  description: "Make a symphony from fart samples. Tap out a rhythm, change the pitch, and download your composition.",
};

export default function SymphonyPage() {
  return <SymphonyStudio />;
}
