import { cn } from '@/lib/utils';

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function Select({ options, value, onChange, className }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-6 rounded border border-border bg-background px-1.5 text-[11px] font-medium text-muted-foreground',
        'focus:outline-none focus:ring-1 focus:ring-ring',
        className,
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
