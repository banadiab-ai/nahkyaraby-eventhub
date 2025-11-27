import { Calendar, MapPin, Clock, Users, CheckCircle, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Event, StaffMember } from '../App';
import { Avatar, AvatarFallback } from './ui/avatar';
import { formatDateShort } from '../utils/dateUtils';

interface StaffingOverviewProps {
  events: Event[];
  staffMembers: StaffMember[];
  onConfirmParticipation: (eventId: string, staffId: string) => void;
  onConfirmAllParticipants: (eventId: string) => void;
  onCloseEvent: (eventId: string, approvedStaffIds: string[]) => void;
}

export function StaffingOverview({ events, staffMembers, onConfirmParticipation, onConfirmAllParticipants, onCloseEvent }: StaffingOverviewProps) {
  // Show all events (past, current, and upcoming), sorted by date (most recent first)
  const allEvents = events
    .filter(e => e.status !== 'cancelled' && e.status !== 'draft')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getStaffById = (id: string) => staffMembers.find(s => s.id === id);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const isConfirmed = (event: Event, staffId: string) => {
    return event.confirmedStaff?.includes(staffId) || false;
  };

  const hasReceivedPoints = (event: Event, staffId: string) => {
    return event.pointsAwarded?.includes(staffId) || false;
  };

  const isPastEvent = (event: Event) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Parse end date if available, otherwise use start date
    const endDateStr = event.endDate || event.date;
    const [year, month, day] = endDateStr.split('-').map(Number);
    const endDate = new Date(year, month - 1, day);
    endDate.setHours(0, 0, 0, 0);
    
    // Event is past if end date has passed
    return endDate < today;
  };

  const isCurrentEvent = (event: Event) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Parse start date
    const [startYear, startMonth, startDay] = event.date.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay);
    startDate.setHours(0, 0, 0, 0);
    
    // Parse end date if available, otherwise use start date
    const endDateStr = event.endDate || event.date;
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);
    endDate.setHours(0, 0, 0, 0);
    
    // Event is current if today falls between start and end (inclusive)
    return today >= startDate && today <= endDate;
  };

  const getEventStatus = (event: Event) => {
    if (isCurrentEvent(event)) return 'Current';
    if (isPastEvent(event)) return 'Past';
    return 'Upcoming';
  };

  const getUnconfirmedCount = (event: Event) => {
    // Only count staff who are selected but haven't received points yet
    const selectedStaff = event.confirmedStaff || [];
    const awarded = event.pointsAwarded || [];
    return selectedStaff.filter(id => !awarded.includes(id)).length;
  };

  // In overview, only show selected staff (from confirmedStaff)
  const getVisibleStaff = (event: Event) => {
    // Always only show confirmed/selected staff in overview
    return (event.confirmedStaff || []).filter(id => getStaffById(id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-gray-900">Staffing Overview</h2>
        <p className="text-gray-500">View staff sign-ups and confirm participation for past events</p>
      </div>

      {allEvents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No events to display
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allEvents.map(event => {
            const visibleStaff = getVisibleStaff(event);
            const eventStatus = getEventStatus(event);
            const canConfirm = isPastEvent(event); // Allow confirming for any past event
            const unconfirmedCount = getUnconfirmedCount(event);
            
            return (
              <Card key={event.id}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div>{event.name}</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <div className="flex items-center text-gray-600">
                          <Calendar className="h-4 w-4 mr-1" />
                          {formatDateShort(event.date)}
                          {event.endDate && event.endDate !== event.date && (
                            <> - {formatDateShort(event.endDate)}</>
                          )}
                        </div>
                        <div className="flex items-center text-gray-600">
                          <Clock className="h-4 w-4 mr-1" />
                          {event.time}
                        </div>
                        <div className="flex items-center text-gray-600">
                          <MapPin className="h-4 w-4 mr-1" />
                          {event.location}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge 
                        variant={eventStatus === 'Past' ? 'secondary' : eventStatus === 'Closed' ? 'outline' : 'default'}
                        className={eventStatus === 'Closed' ? 'bg-gray-200 text-gray-700' : ''}
                      >
                        {eventStatus}
                      </Badge>
                      {visibleStaff.length > 0 && (
                        <Badge variant="secondary">
                          {visibleStaff.length} {eventStatus === 'Closed' || (eventStatus === 'Past' && event.confirmedStaff) ? 'selected' : 'sign-ups'}
                        </Badge>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {visibleStaff.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      {eventStatus === 'Closed' || isPastEvent(event) 
                        ? 'No staff members selected for this event'
                        : 'No staff members signed up yet'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {canConfirm && unconfirmedCount > 0 && (
                        <div className="flex justify-between items-center pb-2 border-b">
                          <p className="text-sm text-gray-600">
                            {unconfirmedCount} staff member{unconfirmedCount !== 1 ? 's' : ''} awaiting confirmation
                          </p>
                          <Button
                            onClick={() => onConfirmAllParticipants(event.id)}
                            variant="outline"
                            size="sm"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirm All
                          </Button>
                        </div>
                      )}
                      {visibleStaff.map(staffId => {
                        const staff = getStaffById(staffId);
                        if (!staff) return null;
                        
                        const confirmed = isConfirmed(event, staffId);
                        const receivedPoints = hasReceivedPoints(event, staffId);
                        
                        return (
                          <div
                            key={staffId}
                            className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Avatar className="flex-shrink-0">
                                <AvatarFallback className="bg-blue-500 text-white">
                                  {getInitials(staff.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="text-gray-900 truncate">{staff.name}</div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-gray-500 text-sm truncate">{staff.email}</span>
                                  <Badge variant="outline" className="text-xs flex-shrink-0">
                                    {staff.level || 'No Level'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            {receivedPoints ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                                  <Award className="h-3 w-3 mr-1" />
                                  <span className="hidden sm:inline">Points Awarded</span>
                                  <span className="sm:hidden">+{event.points}</span>
                                </Badge>
                              </div>
                            ) : confirmed && canConfirm ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-sm text-gray-600">+{event.points} pts</span>
                                <Button
                                  onClick={() => onConfirmParticipation(event.id, staffId)}
                                  size="sm"
                                  variant="outline"
                                  className="flex-shrink-0"
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Confirm
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
