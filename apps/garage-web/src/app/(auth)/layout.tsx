export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-[13px] font-semibold text-paper">
          LG
        </div>
        <span className="text-[16px] font-semibold text-ink">Le Garage</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
