/** علامات الصح بتاعة صلاحيات الموظف (بند 87). `null` = صلاحيات كاملة زي المالك. */
import { EMPTY_PERMISSIONS, PAGE_PERMISSIONS } from "@/lib/permissions";
import type { UserPermissions } from "@/types";

export function PermissionsEditor({
  value,
  onChange,
}: {
  value: UserPermissions | null;
  onChange: (next: UserPermissions | null) => void;
}) {
  const full = value === null;
  const pages = new Set(value?.pages ?? []);

  function togglePage(key: string, on: boolean) {
    if (!value) return;
    const next = new Set(pages);
    if (on) next.add(key);
    else next.delete(key);
    onChange({ ...value, pages: PAGE_PERMISSIONS.map((p) => p.key).filter((k) => next.has(k)) });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={full}
          onChange={(e) => onChange(e.target.checked ? null : EMPTY_PERMISSIONS)}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <span>
          <span className="block text-sm font-bold text-foreground">صلاحيات كاملة (زي المالك)</span>
          <span className="block text-xs text-muted-foreground">
            يشوف كل حاجة ويضيف موظفين — لشريكك أو حد بتثق فيه جدًا بس.
          </span>
        </span>
      </label>

      {!full && value && (
        <>
          <p className="text-xs font-bold text-foreground">علّم على الصفحات اللي يفتحها:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PAGE_PERMISSIONS.map((p) => (
              <label
                key={p.key}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={pages.has(p.key)}
                  onChange={(e) => togglePage(p.key, e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-foreground">{p.label}</span>
                {p.sensitive && <span title="فلوس أو حسابات">⚠️</span>}
              </label>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-2 py-1.5">
            <input
              type="checkbox"
              checked={value.edit_delete}
              onChange={(e) => onChange({ ...value, edit_delete: e.target.checked })}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-bold text-foreground">يقدر يحذف ويعدّل ⚠️</span>
              <span className="block text-xs text-muted-foreground">
                تعديل أو حذف تحصيل قديم، أو عميل، أو صنف، أو إلغاء فاتورة/عقد.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            المستخدمين والإعدادات للمالك بس دايمًا. الإشعارات مفتوحة للكل.
          </p>
        </>
      )}
    </div>
  );
}
