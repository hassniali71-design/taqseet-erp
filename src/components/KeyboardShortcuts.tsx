/** اختصارات الكيبورد (src/lib/shortcuts.ts) — بند 83، منقول من دكانة/سفرة `keyboard-shortcuts.tsx`:
 * بتسمع للزراير في كل الصفحات، وبتعرض شاشة «الاختصارات» (Alt+0). بتتركّب مرة واحدة من القايمة
 * الجانبية. الشباك نفسه `SimpleDialog` (المشروع ده مفيهوش مكوّن الشباك الجاهز). */
import { useNavigate } from "@tanstack/react-router";
import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";

import { SimpleDialog } from "@/components/InstallAppButton";
import { HELP_SHORTCUT, SHORTCUTS_OPEN_EVENT as OPEN_EVENT, shortcutOf } from "@/lib/shortcuts";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";

export type ShortcutItem = { url: string; title: string; key: string };

/** شكل الزرار جوه الكلام: «F2» أو «Alt + 3» */
export function Kbd({ k, className }: { k: string; className?: string }) {
  return (
    <kbd
      dir="ltr"
      className={cn(
        "inline-flex items-center rounded border border-current/20 bg-black/5 px-1.5 py-0.5 font-mono text-[0.7rem] leading-none opacity-70",
        className,
      )}
    >
      {k.replace("+", " + ")}
    </kbd>
  );
}

export function KeyboardShortcuts({ items }: { items: ShortcutItem[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = shortcutOf(e);
      if (!k) return;
      if (k === HELP_SHORTCUT) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      const item = items.find((i) => i.key === k);
      if (!item) return;
      // F5 (تحديث الصفحة) وF1 (المساعدة) وغيرهم: الاختصار بتاعنا هو اللي يشتغل
      e.preventDefault();
      setOpen(false);
      playSound("click");
      void navigate({ to: item.url });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [items, navigate]);

  return (
    <SimpleDialog
      open={open}
      onClose={() => setOpen(false)}
      title={
        <>
          <Keyboard className="h-5 w-5 text-primary" />
          الاختصارات
        </>
      }
    >
      <p className="text-muted-foreground">
        من أي صفحة، حتى وإنت بتكتب: دوس الزرار وتروح للصفحة على طول.
      </p>
      <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-md border border-border">
        <table className="keep-table w-full text-sm">
          <tbody>
            {items.map((i) => (
              <tr key={i.url} className="border-b border-border last:border-b-0">
                <td className="p-2">
                  <button
                    type="button"
                    className="w-full text-start hover:text-primary"
                    onClick={() => {
                      setOpen(false);
                      void navigate({ to: i.url });
                    }}
                  >
                    {i.title}
                  </button>
                </td>
                <td className="p-2 text-end">
                  <Kbd k={i.key} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="p-2 text-muted-foreground">الشاشة دي (الاختصارات)</td>
              <td className="p-2 text-end">
                <Kbd k={HELP_SHORTCUT} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </SimpleDialog>
  );
}
