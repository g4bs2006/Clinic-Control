"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, MapPin, X } from "lucide-react";
import { listClinics } from "@/lib/clinics/actions";
import type { Clinic } from "@/lib/clinics/schema";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const router = useRouter();
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle modal open/close
  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Listen to Ctrl+K or Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        toggleOpen();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleOpen]);

  // Listen to custom sidebar click event
  useEffect(() => {
    function handleCustomEvent() {
      setIsOpen(true);
    }
    window.addEventListener("cc-open-search", handleCustomEvent);
    return () => window.removeEventListener("cc-open-search", handleCustomEvent);
  }, []);

  // Fetch clinics when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      if (clinics.length === 0) {
        setLoading(true);
        listClinics()
          .then((data) => setClinics(data))
          .catch((err) => console.error("Erro ao carregar lista de busca:", err))
          .finally(() => setLoading(false));
      }
    }
  }, [isOpen, clinics.length]);

  // Filter clinics
  const filtered = query.trim()
    ? clinics.filter((c) => {
        const term = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(term) ||
          c.city?.toLowerCase().includes(term) ||
          c.state?.toLowerCase().includes(term) ||
          c.region?.toLowerCase().includes(term) ||
          c.system?.toLowerCase().includes(term)
        );
      })
    : clinics.slice(0, 5); // show top 5 when empty

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Handle navigate
  const handleSelect = useCallback((clinicId: string) => {
    setIsOpen(false);
    router.push(`/clinicas/${clinicId}`);
  }, [router]);

  // Keyboard navigation inside list
  useEffect(() => {
    if (!isOpen) return;

    function handleKeys(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered.length && filtered[activeIndex]) {
          handleSelect(filtered[activeIndex].id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [isOpen, filtered, activeIndex, handleSelect]);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) setIsOpen(false);
      }}
      className="fixed inset-0 z-[2000] bg-black/75 backdrop-blur-xs flex items-start justify-center pt-[15vh] p-4"
    >
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Input area */}
        <div className="flex items-center gap-3 px-4 border-b border-zinc-900 h-12">
          <Search className="size-4.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clínica por nome, cidade ou sistema..."
            className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
          <span className="text-[0.65rem] text-muted-foreground border border-zinc-800 bg-zinc-900 rounded px-1.5 py-0.5 tabular-nums">
            ESC
          </span>
        </div>

        {/* Results area */}
        <div className="max-h-[320px] overflow-y-auto p-2 scrollbar-none">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
              Carregando clínicas...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
              <span>Nenhuma clínica encontrada</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 py-1.5">
                {query.trim() ? "Resultados" : "Sugestões de Clínicas"}
              </div>
              {filtered.map((clinic, index) => {
                const isActive = index === activeIndex;
                const cityUf = [clinic.city, clinic.state].filter(Boolean).join("/");

                return (
                  <button
                    key={clinic.id}
                    onClick={() => handleSelect(clinic.id)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition-all cursor-pointer",
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-foreground border border-transparent hover:bg-zinc-900/60"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Building2 className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{clinic.name}</div>
                        {cityUf && (
                          <div className="flex items-center gap-1 text-[0.68rem] text-muted-foreground mt-0.5">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{cityUf}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {clinic.system && (
                      <span className="text-[0.65rem] bg-zinc-900 border border-zinc-800 text-muted-foreground rounded px-1.5 py-0.5 font-medium shrink-0">
                        {clinic.system}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/40 border-t border-zinc-900 text-[0.65rem] text-muted-foreground select-none">
          <div className="flex items-center gap-3">
            <span>↑↓ para navegar</span>
            <span>↵ para selecionar</span>
          </div>
          <span>fechar com ESC</span>
        </div>
      </div>
    </div>
  );
}
