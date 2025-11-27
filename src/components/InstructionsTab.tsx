import { Info, Mail, Send, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

export function InstructionsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-gray-900">Instructions & Setup Guides</h2>
        <p className="text-gray-500">Complete setup guides and instructions for all features</p>
      </div>

      {/* Telegram Setup Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-600" />
            Telegram Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <div>
                <strong className="text-blue-900">📱 How to Set Up Telegram Notifications:</strong>
                <div className="text-blue-800 mt-2 text-sm space-y-2">
                  <p><strong>Step 1:</strong> Staff member reaches out saying they've completed Telegram registration and sent the /start message to your bot.</p>
                  <p><strong>Step 2:</strong> Go to the Staff tab and edit the staff member's profile</p>
                  <p><strong>Step 3:</strong> Click on <strong>Fetch from Bot</strong> button</p>
                  <p><strong>Step 4:</strong> Select the correct username from the list</p>
                  <p><strong>Step 5:</strong> Save changes</p>
                  <p className="pt-2 border-t border-blue-200">
                    💡 <strong>Pro tip:</strong> Use the <strong>Test Connection</strong> button to verify the Chat ID works before saving.
                  </p>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">How to Get Telegram Chat ID</h4>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                  1
                </div>
                <div>
                  <h5 className="font-medium text-gray-900">Staff member starts the bot</h5>
                  <p className="text-gray-600 mt-1">
                    The staff member needs to open Telegram, search for your bot by name, and send any message to start the conversation (e.g., "/start" or "Hello").
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                  2
                </div>
                <div>
                  <h5 className="font-medium text-gray-900">Get Chat ID from @nahkyaraby_bot</h5>
                  <p className="text-gray-600 mt-1">The staff member should:</p>
                  <ul className="list-disc ml-5 mt-1 text-gray-600 space-y-1">
                    <li>Search for <strong>@nahkyaraby_bot</strong> on Telegram</li>
                    <li>Send any message to the bot</li>
                    <li>The bot will reply with their user information including the <strong>Chat ID</strong> (a numeric ID like 123456789)</li>
                  </ul>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                  3
                </div>
                <div>
                  <h5 className="font-medium text-gray-900">Admin enters Chat ID</h5>
                  <p className="text-gray-600 mt-1">
                    Copy the numeric Chat ID and paste it in the "Telegram Chat ID" field when editing staff profile, or use "Fetch from Bot" to auto-select.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-semibold">
                  ✓
                </div>
                <div>
                  <h5 className="font-medium text-gray-900">Test the connection</h5>
                  <p className="text-gray-600 mt-1">
                    Use the "Test Connection" button to verify the Chat ID works before saving.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Alert className="bg-amber-50 border-amber-200">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900">
              <p className="font-medium mb-2">✅ Valid Chat ID Example:</p>
              <div className="bg-white px-3 py-2 rounded border border-amber-300 font-mono text-green-700 mb-3">
                123456789
              </div>
              <p className="font-medium mb-2">❌ Invalid Examples:</p>
              <div className="space-y-1 mb-3">
                <div className="bg-white px-3 py-2 rounded border border-red-300 font-mono text-red-700 line-through">
                  @username
                </div>
                <div className="bg-white px-3 py-2 rounded border border-red-300 font-mono text-red-700 line-through">
                  username
                </div>
              </div>
              <p className="font-medium mb-2">Common Issues:</p>
              <ul className="text-sm space-y-1 list-disc ml-5">
                <li><strong>"Chat not found"</strong> - The user hasn't messaged your bot yet</li>
                <li><strong>"Bot was blocked"</strong> - The user blocked your bot in Telegram</li>
                <li><strong>Using username</strong> - Must use numeric ID, not @username</li>
              </ul>
              <p className="text-sm mt-2">
                💡 <strong>Best Practice:</strong> Use the "Fetch from Bot" button to automatically get the correct numeric Chat IDs!
              </p>
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">What Telegram notifications are sent?</h4>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 shrink-0">
                  New Events
                </Badge>
                <p>When you create a new event, all staff at the required level or above receive a Telegram notification.</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 shrink-0">
                  Event Updates
                </Badge>
                <p>When you edit an event, participating staff (for open events) or selected staff (for closed events) receive notifications with details of what changed.</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 shrink-0">
                  Event Closure
                </Badge>
                <p>When you close an event, only staff whose selection status changed receive notifications about being selected or not selected.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Management Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-purple-600" />
            Event Management Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Event Status Flow</h4>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300 shrink-0 h-6">
                  Draft
                </Badge>
                <div className="flex-1">
                  <p className="text-gray-700">Event is being prepared. Staff cannot see or sign up for draft events. No notifications are sent.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 shrink-0 h-6">
                  Open
                </Badge>
                <div className="flex-1">
                  <p className="text-gray-700">Event is published and visible to staff. Staff can sign up. When first opened, Telegram notifications are sent to eligible staff.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 shrink-0 h-6">
                  Closed
                </Badge>
                <div className="flex-1">
                  <p className="text-gray-700">Sign-ups are closed. Only selected staff are confirmed. Notifications sent only to staff whose selection status changed.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 shrink-0 h-6">
                  Cancelled
                </Badge>
                <div className="flex-1">
                  <p className="text-gray-700">Event is cancelled. All signed-up staff are notified via Telegram and email.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="font-medium text-blue-900">💡 Tips for Event Management:</p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc ml-5">
              <li><strong>Use Draft status</strong> when creating events you're not ready to publish yet</li>
              <li><strong>Close events</strong> when you've selected the staff you need - this locks in participation</li>
              <li><strong>Use "Confirm All"</strong> to quickly select all signed-up staff for participation</li>
              <li><strong>Release points</strong> after the event is complete in the Overview tab</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Level System Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-orange-600" />
            Level System Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">How Level Hierarchy Works</h4>
            <Alert className="bg-orange-50 border-orange-200">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-900">
                <p className="mb-2">
                  <strong>Important:</strong> The level ordering is <strong>inverted</strong> - the top level is the lowest rank, and the bottom is the highest rank.
                </p>
                <p>
                  Staff at a specific level can see events at their level <strong>and all levels above</strong> (lower in the hierarchy).
                </p>
              </AlertDescription>
            </Alert>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Example Level Structure</h4>
            <div className="bg-white border rounded-lg p-4 space-y-2 text-sm">
              <div className="flex items-center gap-3 pb-2 border-b">
                <div className="w-12 text-center font-semibold text-gray-500">Order</div>
                <div className="flex-1 font-semibold text-gray-900">Level Name</div>
                <div className="font-semibold text-gray-900">Can See Events For</div>
              </div>
              <div className="flex items-center gap-3 py-1">
                <div className="w-12 text-center text-gray-600">1</div>
                <div className="flex-1">Beginner (0 pts)</div>
                <div className="text-gray-600">Beginner only</div>
              </div>
              <div className="flex items-center gap-3 py-1">
                <div className="w-12 text-center text-gray-600">2</div>
                <div className="flex-1">Intermediate (100 pts)</div>
                <div className="text-gray-600">Beginner + Intermediate</div>
              </div>
              <div className="flex items-center gap-3 py-1">
                <div className="w-12 text-center text-gray-600">3</div>
                <div className="flex-1">Expert (300 pts)</div>
                <div className="text-gray-600">All levels</div>
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-900">
              <strong>💡 Pro Tip:</strong> Staff automatically level up when they reach the required points. You can reorder levels in the Settings tab by dragging them.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Points System Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-green-600" />
            Points System Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">How Points Work</h4>
            <div className="space-y-2 text-sm text-gray-700">
              <p><strong>1. Event Points:</strong> Set point values when creating events. Points are awarded after event completion.</p>
              <p><strong>2. Manual Adjustments:</strong> Add or deduct points in the Staff tab for performance, punctuality, or other metrics.</p>
              <p><strong>3. Point Release:</strong> After events complete, go to Overview tab and confirm each staff member's participation to release points.</p>
              <p><strong>4. Automatic Leveling:</strong> Staff automatically advance to the next level when they reach the required points.</p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Points Log</h4>
            <p className="text-sm text-gray-700">
              The Points Log tab shows a complete history of all point transactions including:
            </p>
            <ul className="text-sm text-gray-700 space-y-1 list-disc ml-5">
              <li>Manual point adjustments with reasons</li>
              <li>Event completion rewards</li>
              <li>Timestamp and admin who made the adjustment</li>
              <li>Running balance for each transaction</li>
            </ul>
          </div>

          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <p>
                <strong>Remember:</strong> Points are only awarded when you explicitly confirm participation in the Overview tab. Just signing up for an event doesn't automatically grant points.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}