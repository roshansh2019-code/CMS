import React, { useEffect, useState } from "react";
import axios from "axios";
import { ReceiptModal } from "./feeSystem";
import "./feeSystem.css";

const API = `http://${window.location.hostname}:5000`;

function StudentFeePayments() {
  const user = JSON.parse(localStorage.getItem("user")) || {};

  const [records, setRecords]   = useState([]);
  const [summary, setSummary]   = useState({ total_fee: 0, total_paid: 0, due_amount: 0 });
  const [loading, setLoading]   = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    if (!user.roll) {
      setErrorMsg("Could not determine your roll number — please log in again.");
      setLoading(false);
      return;
    }

    axios.get(`${API}/student-fees/${user.roll}/history`)
      .then(res => {
        if (res.data?.success) {
          setRecords(res.data.records || []);
          setSummary(res.data.summary || { total_fee: 0, total_paid: 0, due_amount: 0 });
        } else {
          setErrorMsg(res.data?.message || "Could not load your fee history");
        }
      })
      .catch(() => setErrorMsg("Could not load your fee history"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalFee  = parseFloat(summary.total_fee || 0);
  const totalPaid = parseFloat(summary.total_paid || 0);
  const dueAmount = Math.max(0, parseFloat(summary.due_amount || 0));
  const paidPercent = totalFee > 0 ? Math.min(100, Math.round((totalPaid / totalFee) * 100)) : 0;

  return (
    <div className="fee-system-container">
      {receiptData && (
        <ReceiptModal receipt={receiptData} onClose={() => setReceiptData(null)} />
      )}

      <div className="form-card">
        <h2 className="form-heading">My Fee Payments</h2>

        {loading && <p>Loading your fee history…</p>}
        {!loading && errorMsg && <p className="td-due-red">{errorMsg}</p>}

        {!loading && !errorMsg && (
          <>
            <div className="totals-bar">
              <div className="total-item-primary">
                Total Program Fee <strong>Rs. {totalFee.toFixed(2)}</strong>
              </div>
              <div className="total-item-success">
                Total Paid <strong>Rs. {totalPaid.toFixed(2)}</strong>
              </div>
              <div className="total-item-danger">
                Due <strong>Rs. {dueAmount.toFixed(2)}</strong>
              </div>
              <div className="total-item">
                Progress <strong>{paidPercent}%</strong>
              </div>
            </div>

            <div className="table-responsive-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th>Date</th>
                    <th className="right-align">Paid (Rs.)</th>
                    <th className="right-align">Additional</th>
                    <th className="center-align">Method</th>
                    <th className="right-align">Due After</th>
                    <th className="center-align">Receipt</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="td-empty center-align">
                        No payment records found yet.
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => {
                      const additionalArr = Array.isArray(r.additional_fees) ? r.additional_fees : [];
                      const additionalSum = additionalArr.reduce(
                        (s, f) => s + parseFloat(f.amount || 0), 0
                      );
                      return (
                        <tr key={r.id} className="table-row">
                          <td className="text-mono text-small">{r.payment_date}</td>
                          <td className="right-align color-success text-extrabold">
                            {parseFloat(r.amount_paid || 0).toFixed(2)}
                          </td>
                          <td className="right-align">
                            {additionalSum > 0 ? `Rs. ${additionalSum.toFixed(2)}` : <span className="text-dash">—</span>}
                          </td>
                          <td className="center-align">
                            <span className={`badge-method ${r.payment_method === "Online" ? "badge-primary" : "badge-amber"}`}>
                              {r.payment_method || "Cash"}
                            </span>
                          </td>
                          <td className={`right-align ${parseFloat(r.due_amount || 0) > 0 ? "td-due-red" : "td-due-green"}`}>
                            {parseFloat(r.due_amount || 0).toFixed(2)}
                          </td>
                          <td className="center-align">
                            <button className="btn-table-print" onClick={() => setReceiptData(r)}>
                              View Receipt
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StudentFeePayments;