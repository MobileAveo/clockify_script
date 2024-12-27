import fs from 'fs';
import { google } from 'googleapis';
const SCOPE = ['https://www.googleapis.com/auth/drive'];

interface TimeEntry {
  timeInterval: {
    start: string;
    end: string;
  };
  description?: string;
  tagIds: string[] | null;
  billable: boolean;
  taskId: string | null;
  projectId: string;
  workspaceId: string;
  customFieldValues: unknown[];
  type: string;
  kioskId: string | null;
  hourlyRate: { amount: number; currency: string };
  costRate: { amount: number; currency: string };
  isLocked: boolean;
}

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

  async getProject(workspaceId: string, projectId: string) {
    const response = await fetch(
      `${this.baseUrl}/workspaces/${workspaceId}/projects/${projectId}`,
      { headers: this.headers }
    );
    return response.json();
  }

  async uploadFile(reportName : string, projectWiseReportName : string): Promise<void> {
    try {
      const authClient = await authorize();

      const drive = google.drive({ version: 'v3', auth: authClient });

      console.log(reportName, projectWiseReportName);

      const response = await drive.files.create({
        requestBody: {
          name: reportName,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [process.env.GOOGLE_FOLDER_ID ?? '']
        },
        media: {
          body: fs.createReadStream(reportName),
          mimeType: 'text/csv'
        },
      });
      // Upload initial report
      console.log('Created spreadsheet:', response.data);
      
      // Add project-wise report as new sheet
      const spreadsheetId = response.data.id;
      console.log(spreadsheetId);
      const sheets = google.sheets({ version: 'v4', auth: authClient });
      
      // Read project-wise CSV content
      const projectWiseCsvContent = fs.readFileSync(projectWiseReportName, 'utf-8');
      const projectWiseRows = projectWiseCsvContent.split('\n').map(row => row.split(','));
      
      // Add new sheet with project-wise data
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId ?? '',
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: 'Project-wise Report'
              }
            }
          }]
        }
      });
      
      // Insert project-wise data into new sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId ?? '',
        range: 'Project-wise Report',
        valueInputOption: 'RAW',
        requestBody: {
          values: projectWiseRows
        }
      });
      
      console.log('Added project-wise report as new sheet');
    } catch (error) {
      console.error('Error uploading file to Google Drive:', error);
      throw new Error('Failed to upload file to Google Drive');
    }
  }
  public async getMonthlyData(): Promise<{
    workspaceId: string;
    users: { id: string; name: string; email: string }[];
    firstDayPrevMonth: Date;
    lastDayPrevMonth: Date;
    reportMonth: string;
    reportYear: number;
    userTimeEntries: { user: { id: string; name: string; email: string }; entries: TimeEntry[] }[];
  }> {
    try {
      const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID ?? '';
      const users = await this.getAllUsers(workspaceId);

      // Calculate date range for the previous month
      const now = new Date();
      const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Get month name and year
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const reportMonth = monthNames[firstDayPrevMonth.getMonth()];
      const reportYear = firstDayPrevMonth.getFullYear();

      // Gather all time entries
      const userTimeEntries = [];
      for (const user of users) {
        try {
          const entries = await this.getUserTimeEntries(
            workspaceId,
            user.id, 
            firstDayPrevMonth.toISOString(),
            lastDayPrevMonth.toISOString()
          );
          userTimeEntries.push({
            user,
            entries
          });
        } catch (err) {
          console.error(`Error getting time entries for user ${user.name}:`, err);
          userTimeEntries.push({
            user,
            entries: []
          });
        }
      }
      return {
        workspaceId,
        users,
        firstDayPrevMonth,
        lastDayPrevMonth,
        reportMonth,
        reportYear,
        userTimeEntries
      };
    } catch (err) {
      console.error('Error getting monthly data:', err);
      throw err;
    }
  }

  async generateAndUploadMonthlyReport(
    users: { id: string; name: string; email: string }[],
    lastDayPrevMonth: Date,
    reportMonth: string,
    reportYear: number,
    userTimeEntries: { user: { id: string; name: string; email: string }; entries: TimeEntry[] }[],
    upload: boolean = false): Promise<{ csvContent: string; fileName: string }> {
    try {
      const reportTitle = `"Monthly report for ${reportMonth} ${reportYear}",,,,\n`;

      // Create CSV header
      let csvContent = reportTitle + 'Name,Email,Total Hours,Task,Hours\n';

      // Gather data for each user
      for (const user of users) {
        const timeEntries = userTimeEntries.find(entry => entry.user.id === user.id)?.entries ?? [];

        // Calculate total hours and organize tasks
        const taskSummary: { [key: string]: number } = {};
        let totalHours = 0;

        timeEntries.forEach((entry: TimeEntry) => {
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
      if (upload) {
        // Save report to file
        const fileName = `reports/report-${lastDayPrevMonth.toISOString().slice(0, 7)}.csv`;
        fs.writeFile(fileName, csvContent, (err) => {
          if (err) throw err;
          console.log('The file has been saved!');
        });

        return { csvContent, fileName };
      }
      return { csvContent, fileName: '' };
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error generating report:', error.message);
      } else {
        console.error('Error generating report:', error);
      }
      throw error;
    }
  }

  async generateProjectWiseReport(users: { id: string; name: string; email: string }[],
    workspaceId: string,
    reportMonth: string,
    reportYear: number,
    firstDayPrevMonth: Date,
    userTimeEntries: { user: { id: string; name: string; email: string }; entries: TimeEntry[] }[],
    upload: boolean = false): Promise<{ csvContent: string; fileName: string }> {
    try {
      let csvContent = `Monthly report for ${reportMonth} ${reportYear},,,,\n`;
      // Initialize project data structure
      const projectData: {
        [projectId: string]: {
          name: string;
          users: {
            [userId: string]: {
              name: string;
              tasks: { [taskName: string]: number };
              totalHours: number;
            };
          };
          totalHours: number;
        };
      } = {};

      // Gather data for each user
      for (const user of users) {
        const timeEntries = userTimeEntries.find(entry => entry.user.id === user.id)?.entries ?? [];
        for (const entry of timeEntries) {
          const duration = new Date(entry.timeInterval.end).getTime() -
            new Date(entry.timeInterval.start).getTime();
          const hours = duration / (1000 * 60 * 60);
          const taskName = entry.description?.replace(/,/g, '').replace(/\n/g, '|') ?? 'Unnamed Task';
          const projectId = entry.projectId;

          // Initialize project data if not exists
          if (!projectData[projectId]) {
            // Fetch project details
            try {
              const projectDetails = await this.getProject(workspaceId, projectId);
              projectData[projectId] = {
                name: projectDetails.name,
                users: {},
                totalHours: 0
              };
            } catch (error) {
              console.error(`Failed to fetch project details for ${projectId}:`, error);
              projectData[projectId] = {
                name: 'Unknown Project',
                users: {},
                totalHours: 0
              };
            }
          }

          if (!projectData[projectId].users[user.id]) {
            projectData[projectId].users[user.id] = {
              name: user.name,
              tasks: {},
              totalHours: 0
            };
          }

          projectData[projectId].users[user.id].tasks[taskName] =
            (projectData[projectId].users[user.id].tasks[taskName] || 0) + hours;
          projectData[projectId].users[user.id].totalHours += hours;
          projectData[projectId].totalHours += hours;
        }
      }

      // Generate CSV content
      for (const [projectId, project] of Object.entries(projectData)) {
        csvContent += `Project name,,${this.escapeCSV(project.name)}(${projectId}),,\n`;
        csvContent += `ID,,Emp Name,Hours,Task\n`;

        for (const [userId, userData] of Object.entries(project.users)) {
          let firstTask = true;
          for (const [taskName, hours] of Object.entries(userData.tasks)) {
            if (firstTask) {
              csvContent += `${userId},,${this.escapeCSV(userData.name)},${hours.toFixed(2)},${this.escapeCSV(taskName)}\n`;
              firstTask = false;
            } else {
              csvContent += `,,,${hours.toFixed(2)},${this.escapeCSV(taskName)}\n`;
            }
          }
          csvContent += `,,${userData.name}'s total Hours,${userData.totalHours.toFixed(2)},\n`;
        }
        csvContent += `,,,,\n`;
        csvContent += `${project.name} total Hours,,${project.totalHours.toFixed(2)},,\n\n`;
      }

      if (upload) {
        const fileName = `reports/project-wise-report-${reportYear}-${(firstDayPrevMonth.getMonth() + 1)
          .toString()
          .padStart(2, '0')}.csv`;
        fs.writeFile(fileName, csvContent, (err) => {
          if (err) throw err;
          console.log('The project-wise report has been saved!');
        });
        return { csvContent, fileName };
      }
      return { csvContent, fileName: '' };
    } catch (error) {
      console.error('Error generating project-wise report:', error);
      throw error;
    }
  }
}
