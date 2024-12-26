import { ClockifyService } from '../../utils/ClockifyService';
import { NextApiRequest, NextApiResponse } from 'next';

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
    const report = await clockify.generateAndUploadMonthlyReport();

    res.status(200).json({ report });
  } catch (error: unknown) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
} 