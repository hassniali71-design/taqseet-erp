import { useEffect } from "react";

import { playSound } from "@/lib/sounds";

/** صوت الغلطة (بند 82): أول ما رسالة غلط تظهر في الصفحة (مبلغ أكبر من المتبقي، سيريال مش متاح...).
 * بيشتغل من effect — بره أي setState، عشان React ميشغّلوش مرتين. */
export function useErrorSound(...errors: Array<string | null | undefined>) {
  const key = errors.filter(Boolean).join("|");
  useEffect(() => {
    if (key) playSound("error");
  }, [key]);
}
