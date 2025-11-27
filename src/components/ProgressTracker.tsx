import { Award, TrendingUp, Calendar, Trophy, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Event } from '../App';
import { Level } from './AdminSettings';

interface ProgressTrackerProps {
  points: number;
  level: string;
  myEvents: Event[];
  levels: Level[];
}

export function ProgressTracker({ points, level, myEvents, levels }: ProgressTrackerProps) {
  // Sort levels by order (top is lowest, bottom is highest)
  const sortedLevels = levels ? [...levels].sort((a, b) => a.order - b.order) : [];
  
  // Color palette for levels
  const colors = [
    'from-[#5D2972] to-[#7a3a94]',
    'from-[#00A5B5] to-[#1ab8c7]',
    'from-[#F6C85F] to-[#f8d580]',
    'from-green-400 to-green-600',
    'from-orange-400 to-orange-600',
  ];

  const currentLevelIndex = sortedLevels.findIndex(l => l.name === level);
  const nextLevel = currentLevelIndex >= 0 && currentLevelIndex < sortedLevels.length - 1 
    ? sortedLevels[currentLevelIndex + 1] 
    : null;
  const currentLevelObj = currentLevelIndex >= 0 ? sortedLevels[currentLevelIndex] : null;
  
  const pointsToNextLevel = nextLevel ? Math.max(0, nextLevel.minPoints - points) : 0;
  const progressPercentage = nextLevel && currentLevelObj
    ? Math.min(((points - currentLevelObj.minPoints) / (nextLevel.minPoints - currentLevelObj.minPoints)) * 100, 100)
    : 100;

  const upcomingEvents = myEvents.filter(e => new Date(e.date) >= new Date());
  const completedEvents = myEvents.filter(e => new Date(e.date) < new Date());
  const totalPotentialPoints = upcomingEvents.reduce((sum, event) => sum + event.points, 0);

  return (
    <div className="space-y-6 mt-4">
      {/* Current Status */}
      <Card className="bg-gradient-to-br from-[#5D2972] to-[#7a3a94] text-white border-0">
        <CardHeader>
          <CardTitle className="flex items-center text-white">
            <Trophy className="h-6 w-6 mr-2" />
            Your Current Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100">Current Level</p>
              <p className="text-white mt-1">{level || 'No Level Assigned'}</p>
            </div>
            <div className="text-right">
              <p className="text-purple-100">Total Points</p>
              <p className="text-white mt-1">{points}</p>
            </div>
          </div>

          {nextLevel && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-purple-100">Progress to {nextLevel.name}</span>
                <span className="text-white">{Math.round(progressPercentage)}%</span>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <p className="text-purple-100 mt-2">
                {pointsToNextLevel} points needed to reach {nextLevel.name}
              </p>
            </div>
          )}

          {!nextLevel && level && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <p className="text-white text-center">
                🎉 You've reached the highest level! Keep earning points to maintain your status.
              </p>
            </div>
          )}

          {!level && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <p className="text-white text-center">
                ℹ️ You need to be assigned a level to start participating in events. Contact your administrator.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Level Progression */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Target className="h-5 w-5 mr-2" />
            Level Progression
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedLevels.map((lvl, index) => {
            const isCurrentLevel = lvl.name === level;
            const isUnlocked = points >= lvl.minPoints;
            const colorClass = colors[index % colors.length];
            
            return (
              <div
                key={lvl.id}
                className={`p-4 rounded-lg border-2 ${
                  isCurrentLevel
                    ? 'border-[#5D2972] bg-[#f4f0f6]'
                    : isUnlocked
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-gray-900">{lvl.name}</div>
                      <p className="text-gray-500">
                        {lvl.minPoints} points required
                      </p>
                    </div>
                  </div>
                  {isCurrentLevel && (
                    <Badge className="bg-[#5D2972] hover:bg-[#4a1f5a]">Current</Badge>
                  )}
                  {isUnlocked && !isCurrentLevel && (
                    <Badge className="bg-green-500">Unlocked</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Activity Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Activity Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-[#f4f0f6] rounded-lg border border-[#e9e1ed]">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-[#5D2972]" />
                <span className="text-gray-600">Upcoming</span>
              </div>
              <p className="text-gray-900">{upcomingEvents.length} events</p>
              <p className="text-gray-500">{totalPotentialPoints} potential pts</p>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <Award className="h-4 w-4 text-green-600" />
                <span className="text-gray-600">Completed</span>
              </div>
              <p className="text-gray-900">{completedEvents.length} events</p>
              <p className="text-gray-500">{points} points earned</p>
            </div>
          </div>

          {upcomingEvents.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <p className="text-purple-900">
                💡 Complete your {upcomingEvents.length} upcoming event{upcomingEvents.length > 1 ? 's' : ''} to earn {totalPotentialPoints} more points!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Benefits by Level */}
      <Card>
        <CardHeader>
          <CardTitle>Level Benefits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedLevels.map((lvl, index) => {
            const isUnlocked = points >= lvl.minPoints;
            const bgColors = [
              'bg-blue-50 border-blue-200',
              'bg-purple-50 border-purple-200',
              'bg-green-50 border-green-200',
              'bg-orange-50 border-orange-200',
              'bg-pink-50 border-pink-200',
            ];
            const badgeColors = [
              'bg-blue-100 text-blue-800 border-blue-300',
              'bg-purple-100 text-purple-800 border-purple-300',
              'bg-green-100 text-green-800 border-green-300',
              'bg-orange-100 text-orange-800 border-orange-300',
              'bg-pink-100 text-pink-800 border-pink-300',
            ];
            
            return (
              <div key={lvl.id} className={`p-3 rounded-lg border ${bgColors[index % bgColors.length]}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={badgeColors[index % badgeColors.length]}>
                    {lvl.name}
                  </Badge>
                  {!isUnlocked && (
                    <span className="text-gray-500">Unlocks at {lvl.minPoints} pts</span>
                  )}
                </div>
                <ul className="space-y-1 text-gray-600">
                  <li>• Access to {lvl.name} level events only</li>
                  <li>• Earn points for each event</li>
                  {index === sortedLevels.length - 1 && <li>• Highest tier member status</li>}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}