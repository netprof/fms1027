import { inputClass } from "@/components/styles";

export function DriverSelect({
  people,
  value,
  required = false,
}: {
  people: { id: number; name: string }[];
  value?: number | null;
  required?: boolean;
}) {
  return (
    <select name="driverId" defaultValue={value ?? ""} required={required} className={inputClass}>
      {!required && <option value="">（未指派）</option>}
      {required && <option value="" disabled>請選擇</option>}
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
