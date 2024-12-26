import fs from 'fs';
import { google } from 'googleapis';
const SCOPE = ['https://www.googleapis.com/auth/drive'];

// A Function that can provide access to google drive api
async function authorize() {
  try {
    const jwtClient = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      "",
      process.env.GOOGLE_PRIVATE_KEY,
      SCOPE
    );
    await jwtClient.authorize();
    return jwtClient;
  } catch (error) {
    throw new Error(`Failed to authorize Google Drive access: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


export class ClockifyService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.clockify.me/api/v1';
    this.headers = {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json'
    };
  }
  async getAllUsers(workspaceId: string) {
    const response = await fetch(`${this.baseUrl}/workspaces/${workspaceId}/users`, {
      headers: this.headers
    });
    return response.json();
  }

  async getUserTimeEntries(workspaceId: string, userId: string, startDate: string, endDate: string) {
    const response = await fetch(
      `${this.baseUrl}/workspaces/${workspaceId}/user/${userId}/time-entries?start=${startDate}&end=${endDate}`,
      { headers: this.headers }
    );
    return response.json();
  }

  private escapeCSV(str: string): string {
    if (typeof str !== 'string') return str;
    // Always wrap in quotes and escape any existing quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }

  async uploadFile(sheetName: string): Promise<void> {
    try {
      const authClient = await authorize();

      const drive = google.drive({ version: 'v3', auth: authClient });
      console.log(sheetName);
      const response = await drive.files.create({
        requestBody: {
          name: sheetName,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [process.env.GOOGLE_FOLDER_ID ?? '']
        },
        media: {
          body: fs.createReadStream(sheetName),
          mimeType: 'text/csv'
        },
      });
      console.log(response.data);
    } catch (error) {
      console.error('Error uploading file to Google Drive:', error);
      throw new Error('Failed to upload file to Google Drive');
    }
  }

  async generateMonthlyReport(): Promise<string> {
    try {
      const workspaceId = '5e2b74c82e357e6b0177d032';
      const users = await this.getAllUsers(workspaceId);

      // Calculate date range for the previous month
      const now = new Date();
      const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Add report title
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const reportMonth = monthNames[firstDayPrevMonth.getMonth()];
      const reportYear = firstDayPrevMonth.getFullYear();
      const reportTitle = `"Monthly report for ${reportMonth} ${reportYear}",,,,\n`;

      // Create CSV header
      let csvContent = reportTitle + 'Name,Email,Total Hours,Task,Hours\n';

      // Gather data for each user
      for (const user of users) {
        const timeEntries = await this.getUserTimeEntries(
          workspaceId,
          user.id,
          firstDayPrevMonth.toISOString(),
          lastDayPrevMonth.toISOString()
        );

        // Calculate total hours and organize tasks
        const taskSummary: { [key: string]: number } = {};
        let totalHours = 0;

        timeEntries.forEach((entry: { timeInterval: { start: string; end: string }, description?: string, tagIds: string[] | null, billable: boolean, taskId: string | null, projectId: string, workspaceId: string, customFieldValues: unknown[], type: string, kioskId: string | null, hourlyRate: { amount: number, currency: string }, costRate: { amount: number, currency: string }, isLocked: boolean }) => {
          const duration = new Date(entry.timeInterval.end).getTime() - new Date(entry.timeInterval.start).getTime();
          const hours = duration / (1000 * 60 * 60);
          totalHours += hours;

          const taskName = entry.description?.replace(/,/g, '').replace(/\n/g, '|') ?? 'Unnamed Task';
          taskSummary[taskName] = (taskSummary[taskName] || 0) + hours;
        });

        // Add user's tasks to CSV
        const tasks = Object.entries(taskSummary);
        if (tasks.length === 0) {
          // If user has no tasks, still add them to the report
          csvContent += `${this.escapeCSV(user.name)},${this.escapeCSV(user.email)},${totalHours.toFixed(2)},,\n`;
        } else {
          // Add each task on a separate line
          tasks.forEach(([taskName, hours], index) => {
            if (index === 0) {
              // First row includes user details
              csvContent += `${this.escapeCSV(user.name)},${this.escapeCSV(user.email)},${totalHours.toFixed(2)},${this.escapeCSV(taskName)},${hours.toFixed(2)}\n`;
            } else {
              // Subsequent rows only include task details
              csvContent += `,,,${this.escapeCSV(taskName)},${hours.toFixed(2)}\n`;
            }
          });
        }
      }

      return csvContent;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error generating report:', error.message);
      } else {
        console.error('Error generating report:', error);
      }
      throw error;
    }
  }

  async generateAndUploadMonthlyReport(): Promise<string> {
    try {
      const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID ?? '';
      const users = await this.getAllUsers(workspaceId);

      // Calculate date range for the previous month
      const now = new Date();
      const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Add report title
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const reportMonth = monthNames[firstDayPrevMonth.getMonth()];
      const reportYear = firstDayPrevMonth.getFullYear();
      const reportTitle = `"Monthly report for ${reportMonth} ${reportYear}",,,,\n`;

      // Create CSV header
      let csvContent = reportTitle + 'Name,Email,Total Hours,Task,Hours\n';

      // Gather data for each user
      for (const user of users) {
        const timeEntries = await this.getUserTimeEntries(
          workspaceId,
          user.id,
          firstDayPrevMonth.toISOString(),
          lastDayPrevMonth.toISOString()
        );

        // Calculate total hours and organize tasks
        const taskSummary: { [key: string]: number } = {};
        let totalHours = 0;

        timeEntries.forEach((entry: { timeInterval: { start: string; end: string }, description?: string, tagIds: string[] | null, billable: boolean, taskId: string | null, projectId: string, workspaceId: string, customFieldValues: unknown[], type: string, kioskId: string | null, hourlyRate: { amount: number, currency: string }, costRate: { amount: number, currency: string }, isLocked: boolean }) => {
          const duration = new Date(entry.timeInterval.end).getTime() - new Date(entry.timeInterval.start).getTime();
          const hours = duration / (1000 * 60 * 60);
          totalHours += hours;

          const taskName = entry.description?.replace(/,/g, '').replace(/\n/g, '|') ?? 'Unnamed Task';
          taskSummary[taskName] = (taskSummary[taskName] || 0) + hours;
        });

        // Add user's tasks to CSV
        const tasks = Object.entries(taskSummary);
        if (tasks.length === 0) {
          // If user has no tasks, still add them to the report
          csvContent += `${this.escapeCSV(user.name)},${this.escapeCSV(user.email)},${totalHours.toFixed(2)},,\n`;
        } else {
          // Add each task on a separate line
          tasks.forEach(([taskName, hours], index) => {
            if (index === 0) {
              // First row includes user details
              csvContent += `${this.escapeCSV(user.name)},${this.escapeCSV(user.email)},${totalHours.toFixed(2)},${this.escapeCSV(taskName)},${hours.toFixed(2)}\n`;
            } else {
              // Subsequent rows only include task details
              csvContent += `,,,${this.escapeCSV(taskName)},${hours.toFixed(2)}\n`;
            }
          });
        }
      }
      // Save report to file
      const fileName = `reports/report-${lastDayPrevMonth.toISOString().slice(0, 7)}.csv`;
      fs.writeFile(fileName, csvContent, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
      });

      await this.uploadFile(fileName);

      return csvContent;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error generating report:', error.message);
      } else {
        console.error('Error generating report:', error);
      }
      throw error;
    }
  }
}
