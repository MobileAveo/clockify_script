import { NextApiRequest, NextApiResponse } from 'next';
import { ClockifyService } from '../../utils/ClockifyService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.CLOCKIFY_API_KEY;
    if (!apiKey) {
      throw new Error('Clockify API key not configured');
    }

    const clockify = new ClockifyService(apiKey);
    const { workspaceId, users, firstDayPrevMonth, lastDayPrevMonth, reportMonth, reportYear, userTimeEntries } = await clockify.getMonthlyData();
    const report = await clockify.generateAndUploadMonthlyReport(users, lastDayPrevMonth, reportMonth, reportYear, userTimeEntries, true);
    const projectWiseReport = await clockify.generateProjectWiseReport(users, workspaceId, reportMonth, reportYear, firstDayPrevMonth, userTimeEntries, true);
    clockify.uploadFile(report.fileName, projectWiseReport.fileName);
    res.status(200).json({ report: report.csvContent, projectWiseReport: projectWiseReport.csvContent });
  } catch (error: unknown) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
} 