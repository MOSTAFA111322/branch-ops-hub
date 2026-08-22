import { useEffect, useRef } from "react";
import { MapView } from "@/components/Map";

type Branch = { id: number; name: string; code?: string | number | null; area?: string | null; city?: string | null; status?: string | null; score?: number | null; revenue?: number | null; latitude?: number | string | null; longitude?: number | string | null; coordinateSource?: string | null; coordinatesVerifiedAt?: Date | string | null };

type Props = { branches: Branch[]; onSelect?: (branch: Branch) => void };

const cityCoordinates: Record<string, google.maps.LatLngLiteral> = {
  الرياض: { lat: 24.7136, lng: 46.6753 },
  جدة: { lat: 21.5433, lng: 39.1728 },
  الدمام: { lat: 26.4207, lng: 50.0888 },
  المدينة: { lat: 24.5247, lng: 39.5692 },
  "المدينة المنورة": { lat: 24.5247, lng: 39.5692 },
  سكاكا: { lat: 29.9697, lng: 40.2064 },
  نجران: { lat: 17.4933, lng: 44.1277 },
  بيشة: { lat: 20.0, lng: 42.6 },
  "خميس مشيط": { lat: 18.3, lng: 42.73 },
};

export function BranchOperationsMap({ branches, onSelect }: Props) {
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  return <section className="rounded-3xl border border-[#d7e6d9] bg-white p-5 shadow-[0_8px_24px_rgba(39,70,48,0.05)]" aria-label="خريطة الفروع التشغيلية">
    <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#4d8068]">الخريطة التشغيلية</p><h2 className="mt-1 text-lg font-bold text-[#174c3d]">توزيع الفروع ومؤشرات الأداء</h2><p className="mt-1 text-[11px] text-[#718376]">تستخدم الخريطة الإحداثيات الموثقة لكل فرع، وتعرض تمركز المدينة فقط عند غياب الإحداثيات.</p></div><div className="flex flex-wrap items-center justify-end gap-2 text-[10px]"><span className="rounded-full bg-[#edf7ef] px-3 py-1 font-semibold text-[#315542]">{branches.length} موقعًا</span><span className="flex items-center gap-1 text-[#52705d]"><span className="h-2.5 w-2.5 rounded-full bg-[#2d7d58]" /> موثق</span><span className="flex items-center gap-1 text-[#9a7220]"><span className="h-2.5 w-2.5 rounded-full bg-[#d2a449]" /> تمركز تقريبي</span></div></div>
    <MapView className="h-[360px] overflow-hidden rounded-2xl" initialCenter={{ lat: 24.2, lng: 45.2 }} initialZoom={5} onMapReady={(map) => {
      markers.current.forEach((marker) => { marker.map = null; });
      markers.current = branches.flatMap((branch) => {
        const area = branch.area ?? "";
        const latitude = Number(branch.latitude); const longitude = Number(branch.longitude); const position = Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude } : Object.entries(cityCoordinates).find(([city]) => area.includes(city) || (branch.city ?? "").includes(city))?.[1];
        if (!position) return [];
        const pin = document.createElement("button");
        pin.type = "button"; pin.title = branch.name; pin.style.cssText = "width:28px;height:28px;border-radius:999px;border:3px solid white;background:#4d9b70;box-shadow:0 2px 8px #174c3d88;cursor:pointer";
        pin.style.background = branch.coordinatesVerifiedAt ? "#2d7d58" : "#d2a449";
        pin.onclick = () => onSelect?.(branch);
        const marker = new google.maps.marker.AdvancedMarkerElement({ map, position, title: `${branch.name} · ${branch.coordinatesVerifiedAt ? "إحداثيات موثقة" : "تمركز تقريبي"} · ${branch.coordinateSource ?? "مصدر غير محدد"}`, content: pin });
        return [marker];
      });
    }} />
    <div className="mt-3 flex flex-wrap gap-2">{branches.filter((branch) => branch.area).slice(0, 12).map((branch) => <button key={branch.id} type="button" onClick={() => onSelect?.(branch)} className="rounded-full border border-[#dce9dd] bg-[#fbfdfb] px-3 py-1.5 text-[10px] text-[#315542] hover:bg-[#eef8f0]"><span className={`ml-1 inline-block h-2 w-2 rounded-full ${branch.coordinatesVerifiedAt ? "bg-[#2d7d58]" : "bg-[#d2a449]"}`} />{branch.name} · {branch.area}</button>)}</div>
  </section>;
}
