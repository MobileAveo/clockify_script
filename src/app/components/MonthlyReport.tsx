'use client';
import { useState } from 'react';

export default function MonthlyReport() {
  const [report, setReport] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/generate-report');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate report');
      }
      setReport(data.report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([report], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Monthly Clockify TaskReport.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Clockify Monthly Report</h1>

      <button
        onClick={generateReport}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        disabled={loading}
      >
        {loading ? 'Generating...' : 'Generate Report'}
      </button>

      {report && (
        <button
          onClick={downloadCsv}
          className="ml-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Download CSV
        </button>
      )}

      {error && (
        <div className="text-red-500 mt-4">
          Error: {error}
        </div>
      )}

      {report && (
        <div className="mt-4">
          <h2 className="text-xl font-semibold mb-2">Report Results:</h2>
          <div className="bg-gray-100 p-4 rounded overflow-x-auto">
            <table className="w-full text-black">
              <tbody>
                {report.split('\n').map((row, i) => (
                  <tr key={i}>
                    {row.split(',').map((cell, j) => (
                      <td key={j} className="border px-2 py-1 font-mono">
                        {cell.replace(/^"|"$/g, '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
} 