import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const ParentHome = () => {
  const { t } = useLang();
  const [mine, setMine] = useState([]);
  useEffect(() => { api.get("/packs/mine").then((r) => setMine(r.data)); }, []);

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("overview")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Your child's progress</h1>
      {mine.length === 0 ? (
        <p className="text-white/60 max-w-md">
          Select a pack in <a href="/parent/packs" className="text-[#00f0ff] underline">Tutor Packs</a> to enroll your child.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4" data-testid="parent-packs">
          {mine.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
              <div className="overline text-[#00f0ff]">{p.tier}</div>
              <div className="font-display text-xl tracking-tighter text-white mt-2">{p.title}</div>
              <div className="text-xs text-white/50 mt-1">{p.grade}</div>
              <div className="mt-4">
                <div className="text-xs text-white/50 mb-1">Progress</div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full w-1/4 bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ParentPacks = () => {
  const { t } = useLang();
  const [packs, setPacks] = useState([]);
  const [enrolled, setEnrolled] = useState(new Set());

  const load = async () => {
    const [all, mine] = await Promise.all([api.get("/packs/list"), api.get("/packs/mine")]);
    setPacks(all.data);
    setEnrolled(new Set(mine.data.map((p) => p.id)));
  };
  useEffect(() => { load(); }, []);

  const enroll = async (id) => {
    await api.post("/packs/enroll", { pack_id: id });
    toast.success("Pack selected");
    load();
  };

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("packs")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Select packs for your child</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="parent-browse">
        {packs.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
            <div className="overline text-[#00f0ff]">{p.tier}</div>
            <div className="font-display text-lg tracking-tight text-white mt-2">{p.title}</div>
            <div className="text-xs text-white/50 mt-1">{p.grade}</div>
            <p className="text-sm text-white/70 mt-3 leading-relaxed">{p.description}</p>
            <button
              data-testid={`parent-enroll-${p.id}`}
              disabled={enrolled.has(p.id)}
              onClick={() => enroll(p.id)}
              className={`mt-4 w-full rounded-full py-2 text-sm font-semibold transition-colors ${
                enrolled.has(p.id) ? "border border-white/10 text-white/50" : "bg-[#00f0ff] text-black hover:bg-white"
              }`}
            >
              {enrolled.has(p.id) ? t("enrolled") : "Select"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export { ParentHome, ParentPacks };
