import { Building2, Bell, ClipboardList, Search, Zap } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";

type PaletteItem = { id: string; label: string; detail?: string; onSelect: () => void };

type GlobalCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: PaletteItem[];
  tasks: PaletteItem[];
  alerts: PaletteItem[];
  navigation: PaletteItem[];
  quickActions: PaletteItem[];
};

export function GlobalCommandPalette({ open, onOpenChange, branches, tasks, alerts, navigation, quickActions }: GlobalCommandPaletteProps) {
  const select = (item: PaletteItem) => {
    item.onSelect();
    onOpenChange(false);
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="ابحث عن فرع أو مهمة أو تنبيه..." />
      <CommandList dir="rtl" className="text-right">
        <CommandEmpty className="py-8 text-xs text-[#89948b]">لا توجد نتائج مطابقة.</CommandEmpty>
        <CommandGroup heading="إجراءات سريعة">
          {quickActions.map((item) => <CommandItem key={item.id} value={`${item.label} ${item.detail ?? ""}`} onSelect={() => select(item)}><Zap className="ml-2 h-4 w-4 text-[#24724e]" /><span className="flex-1">{item.label}<small className="mr-2 text-[10px] text-[#89948b]">{item.detail}</small></span><CommandShortcut>اختصار</CommandShortcut></CommandItem>)}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="التنقل">
          {navigation.map((item) => <CommandItem key={item.id} value={item.label} onSelect={() => select(item)}><Search className="ml-2 h-4 w-4 text-[#7c9183]" /><span>{item.label}</span></CommandItem>)}
        </CommandGroup>
        {branches.length > 0 && <><CommandSeparator /><CommandGroup heading="الفروع"><CommandItem value="الفروع"><Building2 className="ml-2 h-4 w-4 text-[#24724e]" /><span>فتح دليل الفروع</span></CommandItem>{branches.map((item) => <CommandItem key={item.id} value={`${item.label} ${item.detail ?? ""}`} onSelect={() => select(item)}><Building2 className="ml-2 h-4 w-4 text-[#7c9183]" /><span>{item.label}<small className="mr-2 text-[10px] text-[#89948b]">{item.detail}</small></span></CommandItem>)}</CommandGroup></>}
        {tasks.length > 0 && <><CommandSeparator /><CommandGroup heading="المهام والطلبات">{tasks.map((item) => <CommandItem key={item.id} value={`${item.label} ${item.detail ?? ""}`} onSelect={() => select(item)}><ClipboardList className="ml-2 h-4 w-4 text-[#a65d1b]" /><span>{item.label}<small className="mr-2 text-[10px] text-[#89948b]">{item.detail}</small></span></CommandItem>)}</CommandGroup></>}
        {alerts.length > 0 && <><CommandSeparator /><CommandGroup heading="التنبيهات">{alerts.map((item) => <CommandItem key={item.id} value={`${item.label} ${item.detail ?? ""}`} onSelect={() => select(item)}><Bell className="ml-2 h-4 w-4 text-[#b9683e]" /><span>{item.label}<small className="mr-2 text-[10px] text-[#89948b]">{item.detail}</small></span></CommandItem>)}</CommandGroup></>}
      </CommandList>
    </CommandDialog>
  );
}
