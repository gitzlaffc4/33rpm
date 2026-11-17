import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { needsSetup } from "@/lib/setup-code";
import { AuthCardSkeleton } from "../auth-skeleton";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <SetupCard />
    </Suspense>
  );
}

async function SetupCard() {
  await connection();
  if (!needsSetup(getDb())) redirect("/login");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to 33rpm</CardTitle>
        <CardDescription>Create the admin account for this instance.</CardDescription>
      </CardHeader>
      <CardContent>
        <SetupForm />
      </CardContent>
    </Card>
  );
}
