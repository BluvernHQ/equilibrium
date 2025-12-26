"use client";

import MainLayout from "./(routes)/(main-layout)/layout";
import Recordings from "@/modules/recordings/section/recordings";

export default function Home() {
  return (
    <MainLayout>
      <Recordings />
    </MainLayout>
  );
}