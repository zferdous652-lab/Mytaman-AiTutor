import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Package, Dice5, Crown, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

const ProgressList = ({ items }) => (
  <div className="space-y-3">
    {items.map((it) => (
      <div key={it.id}>
        <div className="flex items-center justify-between text-sm mb-1">
          <span className={it.completed ? "text-white/90" : "text-white/70"}>{it.label}</span>
          <span className="text-xs text-white/50 shrink-0 ml-2">
            {it.completed ? (it.claimed ? `+${it.reward} XP claimed` : `+${it.reward} XP`) : `${it.progress}/${it.target}`}
          </span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${it.completed ? "bg-[#2ecc71]" : "bg-[#00f0ff]"}`}
            style={{ width: `${Math.min(100, Math.round((it.progress / it.target) * 100))}%` }}
          />
        </div>
      </div>
    ))}
  </div>
);

const RewardsPanel = () => {
  const [missions, setMissions] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [chests, setChests] = useState([]);
  const [spinStatus, setSpinStatus] = useState(null);
  const [season, setSeason] = useState(null);
  const [spinning, setSpinning] = useState(false);

  const loadAll = async () => {
    const [m, c, ch, sp, se] = await Promise.all([
      api.get("/rewards/missions/weekly"),
      api.get("/rewards/challenges/monthly"),
      api.get("/rewards/chests"),
      api.get("/rewards/spin/status"),
      api.get("/rewards/season"),
    ]);
    setMissions(m.data);
    setChallenges(c.data);
    setChests(ch.data);
    setSpinStatus(sp.data);
    setSeason(se.data);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openChest = async (chestId) => {
    const { data } = await api.post(`/rewards/chests/${chestId}/open`);
    if (!data.already_opened) toast.success(`Chest opened: +${data.amount} XP`);
    loadAll();
  };

  const doSpin = async () => {
    setSpinning(true);
    try {
      const { data } = await api.post("/rewards/spin");
      if (data.already_spun) toast.info("Already spun today — come back tomorrow.");
      else toast.success(`Lucky spin: +${data.amount} XP`);
      loadAll();
    } finally {
      setSpinning(false);
    }
  };

  const claimTier = async (tierNum) => {
    try {
      const { data } = await api.post(`/rewards/season/claim/${tierNum}`);
      toast.success(`Season reward claimed: +${data.xp_awarded} XP`);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't claim that tier yet");
    }
  };

  if (!season) return null;

  const pendingChests = chests.filter((c) => c.status === "pending");
  const openedChests = chests.filter((c) => c.status === "opened");

  return (
    <div className="mt-8">
      <div className="text-sm text-white/50 uppercase tracking-widest mb-4">Rewards</div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid="rewards-missions-card">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={16} className="text-[#00f0ff]" />
            <div className="text-sm text-white font-medium">Weekly missions</div>
          </div>
          <ProgressList items={missions} />
          <div className="flex items-center gap-2 mt-6 mb-4">
            <Crown size={16} className="text-[#00f0ff]" />
            <div className="text-sm text-white font-medium">Monthly challenges</div>
          </div>
          <ProgressList items={challenges} />
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid="rewards-chest-card">
            <div className="flex items-center gap-2 mb-4">
              <Package size={16} className="text-[#8a2be2]" />
              <div className="text-sm text-white font-medium">Mystery chests</div>
            </div>
            {pendingChests.length === 0 && openedChests.length === 0 && (
              <div className="text-sm text-white/40">Level up to earn a mystery chest.</div>
            )}
            <div className="space-y-2">
              {pendingChests.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-[#8a2be2]/30 bg-[#8a2be2]/10 px-4 py-3">
                  <span className="text-sm text-white/90">Level {c.source_key} chest</span>
                  <button
                    data-testid={`open-chest-${c.id}`}
                    onClick={() => openChest(c.id)}
                    className="rounded-full bg-[#8a2be2]/20 border border-[#8a2be2]/40 px-4 py-1.5 text-xs text-white hover:bg-[#8a2be2]/30 transition-colors"
                  >
                    Open
                  </button>
                </div>
              ))}
              {openedChests.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                  <span className="text-sm text-white/60">Level {c.source_key} chest</span>
                  <span className="text-xs text-[#00f0ff]">+{c.amount} XP</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid="rewards-spin-card">
            <div className="flex items-center gap-2 mb-4">
              <Dice5 size={16} className="text-[#ff8a00]" />
              <div className="text-sm text-white font-medium">Lucky spin</div>
            </div>
            {spinStatus?.available ? (
              <button
                data-testid="spin-button"
                onClick={doSpin}
                disabled={spinning}
                className="w-full rounded-full bg-[#ff8a00]/10 border border-[#ff8a00]/40 py-2.5 text-sm text-[#ff8a00] hover:bg-[#ff8a00]/20 transition-colors disabled:opacity-50"
              >
                {spinning ? "Spinning…" : "Spin for XP"}
              </button>
            ) : (
              <div className="text-sm text-white/50">
                {spinStatus?.last_amount != null ? `Today's spin: +${spinStatus.last_amount} XP. Come back tomorrow.` : "Come back tomorrow."}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 mt-6" data-testid="rewards-season-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-[#00f0ff]" />
            <div className="text-sm text-white font-medium">Season {season.season_number}</div>
          </div>
          <div className="text-xs text-white/40">
            {season.season_start} → {season.season_end}
          </div>
        </div>
        <div className="text-sm text-white/60 mb-4">
          <span className="text-white font-semibold">{season.season_xp}</span> season XP · tier {season.current_tier}/{season.tiers.length}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {season.tiers.map((t) => (
            <div
              key={t.tier}
              className={`shrink-0 w-28 rounded-xl border px-3 py-3 text-center ${
                t.claimed
                  ? "border-[#2ecc71]/40 bg-[#2ecc71]/10"
                  : t.unlocked
                  ? "border-[#00f0ff]/40 bg-[#00f0ff]/10"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="text-xs text-white/50 mb-1">Tier {t.tier}</div>
              <div className="text-sm text-white/90 mb-2">{t.xp_required} XP</div>
              {t.reward > 0 && (
                t.claimed ? (
                  <div className="text-xs text-[#2ecc71]">Claimed</div>
                ) : t.unlocked ? (
                  <button
                    data-testid={`claim-tier-${t.tier}`}
                    onClick={() => claimTier(t.tier)}
                    className="text-xs rounded-full bg-[#00f0ff]/20 border border-[#00f0ff]/40 px-2 py-1 text-white hover:bg-[#00f0ff]/30 transition-colors"
                  >
                    +{t.reward} XP
                  </button>
                ) : (
                  <div className="text-xs text-white/30">Locked</div>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RewardsPanel;
