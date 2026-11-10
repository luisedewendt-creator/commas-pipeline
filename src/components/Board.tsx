import type { DealSummary } from "../../shared/types.ts";
import { crmConfig } from "../../config/crm.config.ts";
import { formatDate, formatGmv, stageColor, statusLabel } from "../lib/format.ts";

type Props = {
  deals: DealSummary[];
  onOpen: (id: string) => void;
  onMove: (id: string, stage: string) => void;
};

export function Board({ deals, onOpen, onMove }: Props) {
  return (
    <div className="board">
      {crmConfig.stages.map((stage) => {
        const column = deals.filter((d) => d.stage === stage.id);
        const total = column.reduce((sum, d) => sum + (d.value ?? 0), 0);
        return (
          <section
            key={stage.id}
            className="column"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("drop-active");
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove("drop-active")}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("drop-active");
              const id = e.dataTransfer.getData("text/deal-id");
              if (id) onMove(id, stage.id);
            }}
          >
            <header className="column-header">
              <div className="column-title">
                <span className="dot" style={{ background: stageColor(stage.id) }} />
                <div>
                  <h2>{stage.label}</h2>
                  <p>
                    {column.length} · {formatGmv(total)} {crmConfig.valueField.shortLabel}
                  </p>
                </div>
              </div>
            </header>
            <div className="cards">
              {column.map((deal) => (
                <DealCard key={deal.id} deal={deal} onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DealCard({ deal, onOpen }: { deal: DealSummary; onOpen: (id: string) => void }) {
  return (
    <article
      className="card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/deal-id", deal.id);
        e.currentTarget.classList.add("dragging");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
      onClick={() => onOpen(deal.id)}
    >
      <div className="card-top">
        <div>
          <h3>{deal.name}</h3>
          <p>
            {deal.contactName || "No contact"}
            {deal.company ? ` · ${deal.company}` : ""}
          </p>
        </div>
      </div>
      <div className="card-meta">
        <span className="gmv">
          {formatGmv(deal.value)} {crmConfig.valueField.shortLabel}
        </span>
        <div className="pills">
          {deal.stage === "approved" && (
            <span className="pill approved">
              Approved · {deal.daysSinceApproval ?? 0}d
            </span>
          )}
          {deal.status !== "none" && (
            <span className={`pill ${deal.status}`}>
              {deal.status === "upcoming"
                ? formatDate(deal.nextTask?.dueDate)
                : statusLabel(deal.status, deal.nextTask?.dueDate)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
