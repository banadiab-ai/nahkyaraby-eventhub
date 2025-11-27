import { useState } from 'react';
import { AlertCircle, Check, X, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { api } from '../utils/api';

export function NotificationDebug() {
  const [debugData, setDebugData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDebugInfo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getNotificationDebug();
      setDebugData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load debug information');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Notification Debugging
        </CardTitle>
        <CardDescription>
          Check why staff members might not be receiving notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button 
            onClick={loadDebugInfo}
            disabled={isLoading}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Loading...' : debugData ? 'Refresh Status' : 'Check Notification Status'}
          </Button>
        </div>

        {error && (
          <Alert className="bg-red-50 border-red-200">
            <X className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900">Error</AlertTitle>
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {debugData && (
          <div className="space-y-4">
            {/* Summary */}
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-900">System Summary</AlertTitle>
              <AlertDescription className="text-blue-800">
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div><strong>Total Users:</strong> {debugData.summary.totalUsers}</div>
                  <div><strong>Staff Members:</strong> {debugData.summary.staffMembers}</div>
                  <div><strong>Active Staff:</strong> {debugData.summary.activeStaff}</div>
                  <div><strong>Levels Configured:</strong> {debugData.summary.levelsConfigured}</div>
                  <div className="col-span-2">
                    <strong>Telegram:</strong> {debugData.summary.telegramConnected ? (
                      <span className="text-green-700">✓ Connected (@{debugData.summary.telegramBotName})</span>
                    ) : (
                      <span className="text-red-700">✗ Not Connected</span>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* Levels */}
            {debugData.levels && debugData.levels.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Configured Levels (Top = Lowest, Bottom = Highest)</h3>
                <div className="space-y-1">
                  {debugData.levels.map((level: any, idx: number) => (
                    <div key={level.id || `level-${idx}`} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded">
                      <Badge variant="outline">{idx === 0 ? 'Lowest' : idx === debugData.levels.length - 1 ? 'Highest' : `Tier ${idx + 1}`}</Badge>
                      <span className="font-medium">{level.name}</span>
                      <span className="text-gray-500">({level.minPoints} pts, order: {level.order})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staff Status */}
            <div>
              <h3 className="font-medium mb-2">
                Staff Notification Eligibility ({debugData.staffStatus.length} staff members)
              </h3>
              {debugData.staffStatus.length === 0 && (
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertTitle className="text-yellow-900">No Staff Members Found</AlertTitle>
                  <AlertDescription className="text-yellow-800">
                    No staff members were found in the system. Please invite staff members from the Staff tab.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                {debugData.staffStatus.map((staff: any, index: number) => (
                  <Card key={`${staff.email}-${index}`} className={staff.eligible ? 'border-green-200' : 'border-orange-200'}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {staff.eligible ? (
                              <Check className="h-5 w-5 text-green-600" />
                            ) : (
                              <X className="h-5 w-5 text-orange-600" />
                            )}
                            <span className="font-medium">{staff.name}</span>
                            <Badge variant={staff.eligible ? 'default' : 'destructive'}>
                              {staff.eligible ? 'Eligible' : 'Not Eligible'}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1 ml-7">
                            <div><strong>Email:</strong> {staff.email}</div>
                            <div><strong>Role:</strong> {staff.role}</div>
                            <div><strong>Status:</strong> {staff.status}</div>
                            <div><strong>Level:</strong> {staff.level} (order: {staff.levelOrder})</div>
                            <div>
                              <strong>Telegram Chat ID:</strong>{' '}
                              {staff.telegramChatId === 'NOT SET' ? (
                                <span className="text-red-600">NOT SET</span>
                              ) : (
                                <span className="text-green-600">{staff.telegramChatId}</span>
                              )}
                            </div>
                          </div>
                          {staff.issues && staff.issues.length > 0 && (
                            <Alert className="mt-3 bg-orange-50 border-orange-200">
                              <AlertCircle className="h-4 w-4 text-orange-600" />
                              <AlertTitle className="text-orange-900 text-sm">Issues Preventing Notifications</AlertTitle>
                              <AlertDescription className="text-orange-800">
                                <ul className="list-disc list-inside text-sm space-y-1 mt-1">
                                  {staff.issues.map((issue: string, idx: number) => (
                                    <li key={idx}>{issue}</li>
                                  ))}
                                </ul>
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}