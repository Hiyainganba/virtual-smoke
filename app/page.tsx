import type { Metadata } from "next";
import { SmokingExperience } from "./smoking-experience";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Virtual Cigarette",
  description: "A local, real-time virtual smoke interaction experience.",
};

export default function Home() {
  return <SmokingExperience />;
}
