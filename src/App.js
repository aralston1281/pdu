import { useState } from "react";
import jsPDF from "jspdf";

export default function LoadDistributionPlanner() {
  const [targetLoadMW, setTargetLoadMW] = useState(5);
  const [selectedLineups, setSelectedLineups] = useState(["A01", "A02", "B01", "B02", "C01"]);
  const [customDistribution, setCustomDistribution] = useState([]);
  const [breakerSelection, setBreakerSelection] = useState({});
  const [pduUsage, setPduUsage] = useState({});
  const [lineupWarnings, setLineupWarnings] = useState({});

  const lineupNames = ["A01", "A02", "B01", "B02", "C01", "C02", "D01", "D02", "E01", "E02"];
  const subfeedsPerPDU = 8;
  const subfeedBreakerAmps = 600;
  const subfeedVoltage = 415;
  const powerFactor = 1.0;
  const maxSubfeedKW = (Math.sqrt(3) * subfeedVoltage * subfeedBreakerAmps * powerFactor) / 1000;
  const pduMainBreakerAmps = 996;
  const pduVoltage = 480;
  const pduMaxKW = (Math.sqrt(3) * pduVoltage * pduMainBreakerAmps * powerFactor * 0.8) / 1000;

  const totalPDUs = selectedLineups.reduce(
    (acc, lineup) => acc + (pduUsage[lineup]?.length || 2),
    0
  );
  const evenLoadPerPDU = totalPDUs > 0 ? (targetLoadMW * 1000) / totalPDUs : 0;
  const totalAvailableCapacityMW = ((totalPDUs * pduMaxKW) / 1000).toFixed(2);
  const totalCustomKW = parseFloat(
    customDistribution.reduce((acc, val) => acc + (val || 0), 0).toFixed(2)
  );

  const handleCustomChange = (index, value) => {
    const updated = [...customDistribution];
    updated[index] = Number(parseFloat(value).toFixed(2));
    setCustomDistribution(updated);
  };

  const toggleSubfeed = (pduKey, feedIndex) => {
    setBreakerSelection((prev) => {
      const key = `${pduKey}-S${feedIndex}`;
      const updated = { ...prev };
      if (updated[key]) delete updated[key];
      else updated[key] = true;
      return updated;
    });
  };

  const toggleLineup = (lineup) => {
    setSelectedLineups((prev) =>
      prev.includes(lineup) ? prev.filter((l) => l !== lineup) : [...prev, lineup]
    );
  };

  const togglePdu = (lineup, pduIndex) => {
    setPduUsage((prev) => {
      const current = prev[lineup] || [0, 1];
      const updated = current.includes(pduIndex)
        ? current.filter((p) => p !== pduIndex)
        : [...current, pduIndex].sort();
      return { ...prev, [lineup]: updated };
    });
  };

  const autoDistribute = () => {
    const pduList = selectedLineups.flatMap((lineup) =>
      (pduUsage[lineup] || [0, 1]).map((pdu) => `${lineup}-${pdu + 1}`)
    );
    const distributed = Array(pduList.length).fill(0);
    let remainingLoad = targetLoadMW * 1000;

    const lineupUsedKW = {};
    const pduCapacities = pduList.map((pduKey) => {
      let activeFeeds = 0;
      for (let j = 0; j < subfeedsPerPDU; j++) {
        if (breakerSelection[`${pduKey}-S${j}`]) activeFeeds++;
      }
      const cap = activeFeeds > 0 ? activeFeeds * maxSubfeedKW : pduMaxKW;
      const lineup = pduKey.split("-")[0];
      if (!lineupUsedKW[lineup]) lineupUsedKW[lineup] = 0;
      return cap;
    });

    while (remainingLoad > 0) {
      let anyAllocated = false;
      for (let i = 0; i < distributed.length; i++) {
        const pduKey = pduList[i];
        const cap = pduCapacities[i];
        if (cap === 0) continue;
        const lineup = pduKey.split("-")[0];
        const currentUsage = lineupUsedKW[lineup] || 0;
        if (currentUsage >= pduMaxKW * 2) continue;
        const available = Math.min(cap - distributed[i], pduMaxKW * 2 - currentUsage);
        if (available <= 0) continue;
        const toAssign = Math.min(available, remainingLoad, 10);
        distributed[i] += toAssign;
        lineupUsedKW[lineup] = currentUsage + toAssign;
        remainingLoad -= toAssign;
        anyAllocated = true;
        if (remainingLoad <= 0) break;
      }
      if (!anyAllocated) break;
    }

    setCustomDistribution(distributed.map((val) => parseFloat(val.toFixed(2))));
    const warnings = {};
    Object.keys(lineupUsedKW).forEach((lineup) => {
      if (lineupUsedKW[lineup] >= pduMaxKW * 2) warnings[lineup] = true;
    });
    setLineupWarnings(warnings);
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1rem" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "1rem" }}>
        Load Distribution Planner
      </h1>
      <p style={{ fontSize: "14px", marginBottom: "1rem" }}>
        <strong>Walkthrough:</strong> 1) Enter your total load in MW. 2) Select lineups and PDUs. 3)
        Optionally pick subfeeds. 4) Click <strong>Auto Distribute</strong> to spread load evenly.
      </p>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <label>Target Load (MW)</label>
          <input
            type="number"
            value={targetLoadMW}
            onChange={(e) => setTargetLoadMW(Number(e.target.value))}
            title="Enter your desired total load in megawatts"
          />
        </div>
        <button
          onClick={autoDistribute}
          disabled={totalPDUs === 0}
          title="Distribute load evenly across PDUs"
        >
          Auto Distribute
        </button>
        <button
          onClick={() => {
            setCustomDistribution([]);
            setBreakerSelection({});
            setPduUsage({});
            setSelectedLineups([]);
          }}
          title="Reset all selections"
        >
          Clear All
        </button>
      </div>

      <div>
        <label>Lineups to Use</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {lineupNames.map((lineup) => (
            <div
              key={lineup}
              style={{
                border: "1px solid #ccc",
                padding: "0.5rem",
                borderRadius: "8px",
                minWidth: "140px",
              }}
            >
              <label style={{ fontWeight: "bold" }}>
                <input
                  type="checkbox"
                  checked={selectedLineups.includes(lineup)}
                  onChange={() => toggleLineup(lineup)}
                  title="Include or exclude this lineup"
                />
                {lineup} {lineupWarnings[lineup] && <span style={{ color: "red" }}>⚠️</span>}
              </label>
              {selectedLineups.includes(lineup) && (
                <div style={{ fontSize: "12px", marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {[0, 1].map((i) => (
                    <label key={`${lineup}-${i}`}>
                      <input
                        type="checkbox"
                        checked={(pduUsage[lineup] || [0, 1]).includes(i)}
                        onChange={() => togglePdu(lineup, i)}
                      />
                      {lineup}-{i + 1}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <p>Total PDUs in use: <strong>{totalPDUs}</strong></p>
        <p>Required Even Load per PDU: <strong>{evenLoadPerPDU.toFixed(2)} kW</strong></p>
        <p>Max Capacity per Selected PDU: <strong>{pduMaxKW.toFixed(2)} kW</strong></p>
        <p>Total Available System Capacity: <strong>{totalAvailableCapacityMW} MW</strong></p>
        <p>Total Custom Load: <strong>{totalCustomKW.toFixed(2)} kW</strong></p>
        <p style={{ color: totalCustomKW > targetLoadMW * 1000 ? "red" : "green" }}>
          {totalCustomKW > targetLoadMW * 1000 ? "Exceeds Target Load" : "Within Target Load"}
        </p>
      </div>
    </div>
  );
}
