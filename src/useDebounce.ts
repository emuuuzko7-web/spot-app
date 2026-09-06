import { useEffect, useState } from "react";

// 値が変化してから指定ミリ秒たっても変化しなければ、その値を返す。
// 検索窓で「1文字打つたびに検索」してしまうと通信が多すぎるため、
// 「入力が少し止まったら検索する」という一般的なテクニック(デバウンス)。
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}