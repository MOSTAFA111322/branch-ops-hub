import type { BranchUpdateState } from "@/lib/branchUpdateState";

type Props = {
  branchId: number;
  state: BranchUpdateState;
};

export function BranchUpdateStatus({ branchId, state }: Props) {
  if (state.id !== branchId || state.status === "idle") return null;
  const isError = state.status === "error";
  return <span className={`text-[10px] ${isError ? "text-[#a25c3d]" : "text-[#2d7d58]"}`}>{state.status === "pending" ? "جارٍ الحفظ…" : state.message}</span>;
}
