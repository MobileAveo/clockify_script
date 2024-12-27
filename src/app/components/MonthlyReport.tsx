'use client';
import { useState } from 'react';

type ReportType = 'monthly' | 'project';

export default function MonthlyReport() {
  const [activeTab, setActiveTab] = useState<ReportType>('monthly');
  const [monthlyReport, setMonthlyReport] = useState<string>('');
  const [projectReport, setProjectReport] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/generate-report');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate reports');
      }

      setMonthlyReport(data.report);
      setProjectReport(data.projectWiseReport);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = (type: ReportType) => {
    const report = type === 'monthly' ? monthlyReport : projectReport;
    const fileName = type === 'monthly' ? 'Monthly-Clockify-Report.csv' : 'Project-Wise-Report.csv';

    const blob = new Blob([report], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const renderReport = (report: string) => (
    <div className="mt-4">
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
  );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Clockify Reports</h1>

      {/* Action Buttons - Moved above tabs */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={generateReports}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          disabled={loading}
        >
          {loading ? 'Generating Reports...' : monthlyReport || projectReport ? 'Generate Again' : 'Generate Reports'}
        </button>

        {((activeTab === 'monthly' && monthlyReport) ||
          (activeTab === 'project' && projectReport)) && (
            <button
              onClick={() => downloadCsv(activeTab)}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Download CSV
            </button>
          )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b mb-4">
        <button
          className={`py-2 px-4 mr-2 ${activeTab === 'monthly'
            ? 'border-b-2 border-blue-500 text-blue-500'
            : 'text-gray-500'
            }`}
          onClick={() => setActiveTab('monthly')}
        >
          Monthly Report
        </button>
        <button
          className={`py-2 px-4 ${activeTab === 'project'
            ? 'border-b-2 border-blue-500 text-blue-500'
            : 'text-gray-500'
            }`}
          onClick={() => setActiveTab('project')}
        >
          Project-wise Report
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-blue-500 mt-4">
          Generating reports, please wait...
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="text-red-500 mt-4">
          Error: {error}
        </div>
      )}

      {/* Report Display */}
      {activeTab === 'monthly' && monthlyReport && renderReport(monthlyReport)}
      {activeTab === 'project' && projectReport && renderReport(projectReport)}
    </div>
  );
} 