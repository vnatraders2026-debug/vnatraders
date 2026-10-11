import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/db';
import { ActivityLog, Profile } from '@/types';
import { formatISTDate } from '@/lib/format';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [userFilter, setUserFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const allLogs = await db.activity_logs.orderBy('id').reverse().toArray();
        const allProfiles = await db.profiles.toArray();
        setLogs(allLogs);
        setProfiles(allProfiles);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (userFilter !== 'all' && log.user_name !== userFilter) {
        return false;
      }
      if (entityFilter !== 'all' && log.entity !== entityFilter) {
        return false;
      }
      if (actionFilter !== 'all' && log.action !== actionFilter) {
        return false;
      }
      return true;
    });
  }, [logs, userFilter, entityFilter, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page, pageSize]);

  const toggleRow = (id: number) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const renderDiff = (oldData?: any, newData?: any) => {
    if (!oldData && !newData) {
      return <p className="text-xs text-text-muted">No additional record snapshot available.</p>;
    }

    const allKeys = Array.from(
      new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])
    );

    return (
      <div className="border border-border rounded bg-background p-3 text-xs overflow-x-auto space-y-1">
        <div className="grid grid-cols-3 font-semibold text-text-muted pb-1 border-b border-border">
          <span>Field</span>
          <span>Old Value</span>
          <span>New Value</span>
        </div>
        {allKeys.map((key) => {
          const oldVal = oldData ? JSON.stringify(oldData[key]) : '-';
          const newVal = newData ? JSON.stringify(newData[key]) : '-';
          const hasChanged = oldVal !== newVal;

          return (
            <div
              key={key}
              className={`grid grid-cols-3 py-1 font-mono text-[11px] ${
                hasChanged ? 'bg-accent/5 font-medium text-text' : 'text-text-muted'
              }`}
            >
              <span className="font-sans font-medium text-text">{key}</span>
              <span className="truncate pr-2">{oldVal}</span>
              <span className="truncate">{newVal}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Controls */}
      <div className="bg-surface border border-border rounded p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text">Audit Activity Logs</h2>
          <p className="text-xs text-text-muted">Comprehensive immutable log of store activities</p>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
          <Select
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Users</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.full_name}>
                {p.full_name}
              </option>
            ))}
          </Select>

          <Select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Entities</option>
            <option value="bills">Bills</option>
            <option value="products">Products</option>
            <option value="profiles">Users</option>
            <option value="monthly_targets">Targets</option>
          </Select>

          <Select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Actions</option>
            <option value="INSERT">Create / Insert</option>
            <option value="UPDATE">Update / Edit</option>
          </Select>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : filteredLogs.length === 0 ? (
        <EmptyState message="No activity logs match the selected filters" />
      ) : (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Time (IST)</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.map((log) => {
                const isExpanded = expandedRowId === log.id;

                return (
                  <React.Fragment key={log.id}>
                    <TableRow
                      onClick={() => toggleRow(log.id)}
                      className="cursor-pointer"
                    >
                      <TableCell className="w-10 text-text-muted">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </TableCell>
                      <TableCell className="text-xs text-text-muted whitespace-nowrap">
                        {formatISTDate(log.created_at)}
                      </TableCell>
                      <TableCell className="font-medium text-xs">
                        {log.user_name || 'System'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                            log.action === 'INSERT'
                              ? 'bg-success-light text-success'
                              : 'bg-accent-light text-accent'
                          }`}
                        >
                          {log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-text-muted font-mono uppercase">
                        {log.entity}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-text">
                        {log.summary}
                      </TableCell>
                    </TableRow>

                    {/* Expandable Key-by-Key Diff Row */}
                    {isExpanded && (
                      <tr className="bg-background/40">
                        <td colSpan={6} className="p-3 pl-12 border-b border-border">
                          {renderDiff(log.old_data, log.new_data)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 bg-surface border border-border rounded text-xs">
              <span className="text-text-muted">
                Showing page {page} of {totalPages} ({filteredLogs.length} total entries)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[32px] py-1 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[32px] py-1 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
