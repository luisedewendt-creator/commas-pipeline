import type { DealSummary } from "../../shared/types.ts";
import { crmConfig } from "../../config/crm.config.ts";
import { formatDate, formatGmv, stageLabel, statusLabel } from "../lib/format.ts";

type Props = {
  deals: DealSummary[];
  onOpen: (id: string) => void;
};

export function ListView({ deals, onOpen }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deal</th>
            <th>Contact</th>
            <th>Stage</th>
            <th>{crmConfig.valueField.label}</th>
            <th>Next follow-up</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.id} onClick={() => onOpen(deal.id)}>
              <td>
                <strong>{deal.name}</strong>
                <div className="empty" style={{ padding: 0 }}>
                  {deal.company}
                </div>
              </td>
              <td>{deal.contactName || "None"}</td>
              <td>{stageLabel(deal.stage)}</td>
              <td>{formatGmv(deal.value)}</td>
              <td>{deal.nextTask ? `${deal.nextTask.title} · ${formatDate(deal.nextTask.dueDate)}` : "None"}</td>
              <td>
                <span className={`pill ${deal.status}`}>
                  {statusLabel(deal.status, deal.nextTask?.dueDate)}
                </span>
                {deal.stage === "approved" && (
                  <span className="pill approved" style={{ marginLeft: 6 }}>
                    Approved · {deal.daysSinceApproval ?? 0}d
                  </span>
                )}
              </td>
            </tr>
          ))}
          {deals.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                No deals match this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
