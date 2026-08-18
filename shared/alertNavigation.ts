export type AlertNavigationKind = "maintenance" | "document" | "visit" | "checklist" | "action" | string;

export function getAlertNavigationTarget(kind: AlertNavigationKind) {
  if (kind === "maintenance") return "الصيانة والأصول";
  if (kind === "document") return "الوثائق والتراخيص";
  if (kind === "visit" || kind === "checklist") return "الزيارات والفحص";
  return "الإجراءات والتحسين";
}

export function isBranchScopedAlert(kind: AlertNavigationKind) {
  return kind === "visit" || kind === "checklist";
}
