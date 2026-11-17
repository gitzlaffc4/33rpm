import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <Logo className="text-2xl" />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
