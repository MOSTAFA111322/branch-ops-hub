export type BranchUpdateState = {
  id: number | null;
  status: "idle" | "pending" | "success" | "error";
  message?: string;
};

export function beginBranchUpdate(id: number): BranchUpdateState {
  return { id, status: "pending" };
}

export function completeBranchUpdate(id: number): BranchUpdateState {
  return { id, status: "success", message: "تم الحفظ" };
}

export function failBranchUpdate(id: number, message: string): BranchUpdateState {
  return { id, status: "error", message };
}
