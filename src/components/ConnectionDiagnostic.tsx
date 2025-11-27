import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface DiagnosticResult {
  step: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  details?: string;
}

export function ConnectionDiagnostic() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);

  const API_URL = `https://${projectId}.supabase.co/functions/v1/server`;

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);
    const newResults: DiagnosticResult[] = [];

    // Step 1: Check project configuration
    newResults.push({
      step: 'Project Configuration',
      status: 'success',
      message: 'Project ID detected',
      details: `Project: ${projectId}`
    });
    setResults([...newResults]);

    // Step 2: Test health endpoint
    try {
      const healthUrl = `${API_URL}/health`;
      console.log('Testing health endpoint:', healthUrl);
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        newResults.push({
          step: 'Health Check',
          status: 'success',
          message: 'Edge Function is responding',
          details: `Status: ${data.status}`
        });
      } else {
        newResults.push({
          step: 'Health Check',
          status: 'error',
          message: `Edge Function returned error: ${response.status}`,
          details: await response.text()
        });
      }
    } catch (error: any) {
      newResults.push({
        step: 'Health Check',
        status: 'error',
        message: 'Cannot connect to Edge Function',
        details: error.message
      });
    }
    setResults([...newResults]);

    // Step 3: Test status endpoint
    try {
      const statusUrl = `${API_URL}/status`;
      console.log('Testing status endpoint:', statusUrl);
      
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        newResults.push({
          step: 'Status Check',
          status: 'success',
          message: 'Database connection successful',
          details: `Users: ${data.usersCount}, Events: ${data.eventsCount}, Levels: ${data.levelsCount}`
        });
      } else {
        newResults.push({
          step: 'Status Check',
          status: 'error',
          message: `Status endpoint failed: ${response.status}`,
          details: await response.text()
        });
      }
    } catch (error: any) {
      newResults.push({
        step: 'Status Check',
        status: 'error',
        message: 'Cannot check database status',
        details: error.message
      });
    }
    setResults([...newResults]);

    setIsRunning(false);
  };

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'pending':
        return <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />;
    }
  };

  const hasErrors = results.some(r => r.status === 'error');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 flex items-center justify-center">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            Connection Diagnostic Tool
          </CardTitle>
          <CardDescription>
            Testing connection to Nahky Araby Event Hub backend
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {results.length === 0 && !isRunning && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection Issue Detected</AlertTitle>
              <AlertDescription>
                The application cannot connect to the backend server. This may be because you changed the database password.
                Click "Run Diagnostics" to identify the issue.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {results.map((result, index) => (
              <div
                key={index}
                className="p-4 border rounded-lg bg-white shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getStatusIcon(result.status)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="font-medium">{result.step}</div>
                    <div className={`text-sm ${
                      result.status === 'error' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {result.message}
                    </div>
                    {result.details && (
                      <div className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded font-mono">
                        {result.details}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasErrors && results.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Edge Function Not Responding</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Your Edge Function is not accessible. This is likely because:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>The Edge Function crashed or needs to be redeployed</li>
                  <li>Database password change affected internal connections</li>
                  <li>Environment variables need to be verified</li>
                </ol>
                <div className="mt-4 p-3 bg-white text-black rounded-lg space-y-2">
                  <p className="font-semibold">🔧 How to Fix:</p>
                  <ol className="list-decimal ml-4 space-y-2">
                    <li>
                      <strong>Check Supabase Dashboard:</strong>
                      <br />
                      Go to <a href={`https://supabase.com/dashboard/project/${projectId}/functions`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Edge Functions</a>
                    </li>
                    <li>
                      <strong>Check if "server" function is deployed:</strong>
                      <br />
                      Look for a function called "server" in the list
                    </li>
                    <li>
                      <strong>Redeploy the Edge Function:</strong>
                      <br />
                      If you have access to the Supabase CLI, run: <code className="bg-gray-100 px-2 py-1 rounded">supabase functions deploy server</code>
                    </li>
                    <li>
                      <strong>Check Environment Variables:</strong>
                      <br />
                      In Supabase Dashboard → Settings → Edge Functions, verify:
                      <ul className="list-disc ml-4 mt-1">
                        <li>SUPABASE_URL is set correctly</li>
                        <li>SUPABASE_SERVICE_ROLE_KEY is set correctly</li>
                        <li>SUPABASE_ANON_KEY is set correctly</li>
                        <li>RESEND_API_KEY is set (if using email)</li>
                      </ul>
                    </li>
                    <li>
                      <strong>If you changed the database password:</strong>
                      <br />
                      The password change shouldn't affect Edge Functions directly, but you may need to wait a few minutes for Supabase to update internal connections, or try redeploying the function.
                    </li>
                  </ol>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {results.length > 0 && !hasErrors && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">All Tests Passed!</AlertTitle>
              <AlertDescription className="text-green-700">
                The backend is responding correctly. You can try reloading the application.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={runDiagnostics}
              disabled={isRunning}
              className="flex-1"
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Diagnostics...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run Diagnostics
                </>
              )}
            </Button>
            {results.length > 0 && (
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Reload App
              </Button>
            )}
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <div>API URL: {API_URL}</div>
            <div>Project ID: {projectId}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}