import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from './ui/badge';
import { StaffMember, PointAdjustment } from '../App';

interface PointsLogProps {
  pointAdjustments: PointAdjustment[];
  staffMembers: StaffMember[];
  isStaffView?: boolean; // Optional flag to customize labels for staff view
  currentUserId?: string; // Add current user ID to identify current user
  currentUserName?: string; // Add current user name for fallback
}

export function PointsLog({ pointAdjustments, staffMembers, isStaffView = false, currentUserId, currentUserName }: PointsLogProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Debug logging
  console.log('[PointsLog] Received data:', {
    adjustmentsCount: pointAdjustments?.length || 0,
    staffMembersCount: staffMembers?.length || 0,
    isStaffView
  });
  
  // Debug: Log first adjustment to see structure
  if (pointAdjustments?.length > 0) {
    console.log('[PointsLog] Sample adjustment:', pointAdjustments[0]);
  }
  
  // Debug: Log first staff member to see structure  
  if (staffMembers?.length > 0) {
    console.log('[PointsLog] Sample staff member:', staffMembers[0]);
  }

  // Convert PointAdjustments to display format with staff names
  const adjustmentsWithNames = pointAdjustments.map(adj => {
    const staff = staffMembers.find(s => s.id === adj.staffId);
    
    // For staff view, use currentUserName as fallback if this is their own adjustment
    let staffName = staff?.name;
    if (!staffName && currentUserId && adj.staffId === currentUserId && currentUserName) {
      staffName = currentUserName;
    }
    
    console.log('[PointsLog] Looking up staff:', adj.staffId, 'Found:', !!staff, staffName);
    return {
      ...adj,
      staffName: staffName || 'Unknown Staff',
    };
  });

  // Sort by timestamp (newest first)
  const sortedAdjustments = adjustmentsWithNames.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Pagination
  const totalPages = Math.ceil(sortedAdjustments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentAdjustments = sortedAdjustments.slice(startIndex, endIndex);

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStaffName = (staffId: string) => {
    const staff = staffMembers.find(s => s.id === staffId);
    return staff?.name || 'Unknown Staff';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-gray-900">Points Log</h2>
        <p className="text-gray-500">View all point transactions and adjustments</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedAdjustments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No point transactions yet
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead className="text-center">Points</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Date & Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentAdjustments.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div className="text-sm text-gray-900">
                            {transaction.staffName}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant={transaction.points > 0 ? 'default' : 'destructive'}
                            className={transaction.points > 0 ? 'bg-green-600 hover:bg-green-600' : ''}
                          >
                            {transaction.points > 0 ? (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {transaction.points > 0 ? '+' : ''}{transaction.points}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-gray-700 max-w-md">
                            {transaction.reason}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-gray-600">
                            {formatDateTime(transaction.timestamp)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1} to {Math.min(endIndex, sortedAdjustments.length)} of {sortedAdjustments.length} transactions
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}