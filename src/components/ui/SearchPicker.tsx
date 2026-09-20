import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type SearchPickerItem = { id: string; label: string };

function filterItems(items: SearchPickerItem[], query: string): SearchPickerItem[] {
  const q = query.trim();
  if (!q) return items;
  return items.filter((i) => i.label.includes(q));
}

interface SearchPickerProps {
  items: SearchPickerItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Shown as the first, always-visible option (e.g. "عميل نقدي") — selecting it clears value. */
  emptyLabel?: string;
  /** Extra pinned action at the top of the list (e.g. "+ إضافة جهاز جديد") that doesn't select an item. */
  extraAction?: { label: string; onSelect: () => void };
  className?: string;
}

/** بحث بالاسم بدل قائمة select طويلة — النتائج بتعرض الاسم بس (بدون سعر/تفاصيل)،
 * بتفلتر محليًا فوق قائمة already-fetched (مفيش استعلام سيرفر جديد). */
export function SearchPicker({
  items,
  value,
  onChange,
  placeholder,
  emptyLabel,
  extraAction,
  className,
}: SearchPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = items.find((i) => i.id === value);
  const filtered = filterItems(items, query);
  const displayValue = open ? query : (selected?.label ?? "");

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={displayValue}
          placeholder={placeholder ?? "بحث بالاسم..."}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          className="form-input pr-8"
        />
        {selected && !open && (
          <button
            type="button"
            onClick={() => select("")}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="إلغاء الاختيار"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {extraAction && (
            <button
              type="button"
              onClick={() => {
                extraAction.onSelect();
                setOpen(false);
                setQuery("");
              }}
              className="block w-full px-3 py-2 text-right text-sm font-medium text-primary hover:bg-accent"
            >
              {extraAction.label}
            </button>
          )}
          {emptyLabel && (
            <button
              type="button"
              onClick={() => select("")}
              className="block w-full px-3 py-2 text-right text-sm text-muted-foreground hover:bg-accent"
            >
              {emptyLabel}
            </button>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => select(item.id)}
              className="block w-full px-3 py-2 text-right text-sm text-foreground hover:bg-accent"
            >
              {item.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</p>
          )}
        </div>
      )}
    </div>
  );
}

interface SearchPickerMultiProps {
  items: SearchPickerItem[];
  values: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

/** نفس البحث بالاسم، بس بيسمح باختيار أكتر من عنصر (مستخدم في اختيار الشركاء المموّلين
 * لصفقة بيع). العناصر المختارة بتظهر كـchips قابلة للإزالة فوق حقل البحث. */
export function SearchPickerMulti({
  items,
  values,
  onChange,
  placeholder,
  className,
}: SearchPickerMultiProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectedItems = values
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is SearchPickerItem => Boolean(i));
  const remaining = items.filter((i) => !values.includes(i.id));
  const filtered = filterItems(remaining, query);

  function toggle(id: string) {
    onChange([...values, id]);
    setQuery("");
  }

  function remove(id: string) {
    onChange(values.filter((v) => v !== id));
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {selectedItems.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground"
            >
              {item.label}
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`إزالة ${item.label}`}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          placeholder={placeholder ?? "بحث بالاسم..."}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          className="form-input pr-8"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className="block w-full px-3 py-2 text-right text-sm text-foreground hover:bg-accent"
            >
              {item.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</p>
          )}
        </div>
      )}
    </div>
  );
}
