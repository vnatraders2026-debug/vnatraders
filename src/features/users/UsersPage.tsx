import React, { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { db } from '@/db';
import { Profile, UserRole } from '@/types';
import { formatISTDateOnly } from '@/lib/format';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { UserPlus, KeyRound, Shield, EyeOff, Eye, Edit3 } from 'lucide-react';
import { supabase, isConfigured } from '@/lib/supabase';
import { generateUUID } from '@/lib/uuid';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createData, setCreateData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'staff' as UserRole,
  });

  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    email: '',
    role: 'staff' as UserRole,
    is_active: true,
    new_password: '',
  });

  const [resetPwdUser, setResetPwdUser] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [roleChangeUser, setRoleChangeUser] = useState<Profile | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('staff');

  const [confirmToggleUser, setConfirmToggleUser] = useState<Profile | null>(null);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      if (isConfigured && navigator.onLine) {
        const { data: serverProfiles, error } = await supabase.from('profiles').select('*');
        if (!error && serverProfiles) {
          // Replace local Dexie cache with exact Supabase profiles
          await db.profiles.clear();
          await db.profiles.bulkPut(serverProfiles as Profile[]);
          setProfiles(serverProfiles as Profile[]);
          return;
        }
      }
      const all = await db.profiles.toArray();
      const real = all.filter((p) => !p.id.startsWith('00000000'));
      setProfiles(real);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  // 1. Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createData.full_name.trim() || !createData.email.trim() || !createData.password) {
      toast('Please fill all required fields', 'error');
      return;
    }

    const cleanEmail = createData.email.trim().toLowerCase();
    const cleanName = createData.full_name.trim();
    let assignedId = generateUUID();

    if (isConfigured && navigator.onLine) {
      try {
        const { data: createdUserId, error: rpcError } = await supabase.rpc('create_user', {
          p_email: cleanEmail,
          p_password: createData.password,
          p_full_name: cleanName,
          p_role: createData.role,
        });

        if (rpcError) {
          toast(`Supabase error: ${rpcError.message}`, 'error');
          return;
        }
        if (createdUserId) {
          assignedId = createdUserId;
        }
      } catch (err: any) {
        toast(`Network error: ${err.message}`, 'error');
        return;
      }
    }

    const newProfile: Profile = {
      id: assignedId,
      full_name: cleanName,
      email: cleanEmail,
      role: createData.role,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    await db.profiles.put(newProfile);
    // Audit log
    await db.activity_logs.add({
      id: Date.now(),
      user_id: currentUser?.id,
      user_name: currentUser?.full_name,
      action: 'INSERT',
      entity: 'profiles',
      entity_id: newProfile.id,
      summary: `Created user ${newProfile.full_name} (${newProfile.role})`,
      created_at: new Date().toISOString(),
    });

    toast(`Successfully created user ${newProfile.full_name} in database`, 'success');
    setIsCreateOpen(false);
    setCreateData({ full_name: '', email: '', password: '', role: 'staff' });
    loadProfiles();
  };

  // Open Edit User Modal
  const handleOpenEdit = (p: Profile) => {
    setEditingUser(p);
    setEditFormData({
      full_name: p.full_name,
      email: p.email || '',
      role: p.role,
      is_active: p.is_active,
      new_password: '',
    });
  };

  // Save Edit User
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editFormData.full_name.trim()) {
      toast('Full name is required', 'error');
      return;
    }

    const isSelf = editingUser.id === currentUser?.id;
    if (isSelf && editFormData.role !== 'admin') {
      toast('Admins cannot demote their own account', 'error');
      return;
    }
    if (isSelf && !editFormData.is_active) {
      toast('Admins cannot deactivate their own account', 'error');
      return;
    }

    const cleanEmail = editFormData.email.trim().toLowerCase() || editingUser.email;
    const cleanName = editFormData.full_name.trim();

    const updatedProfile: Profile = {
      ...editingUser,
      full_name: cleanName,
      email: cleanEmail,
      role: editFormData.role,
      is_active: editFormData.is_active,
    };

    if (isConfigured && navigator.onLine) {
      try {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: updatedProfile.full_name,
            email: updatedProfile.email,
            role: updatedProfile.role,
            is_active: updatedProfile.is_active,
          })
          .eq('id', editingUser.id);

        if (profileError) {
          toast(`Supabase update error: ${profileError.message}`, 'error');
          return;
        }

        // If new password provided, reset password via RPC
        if (editFormData.new_password.trim()) {
          const { error: pwdError } = await supabase.rpc('reset_user_password', {
            p_user_id: editingUser.id,
            p_new_password: editFormData.new_password.trim(),
          });
          if (pwdError) {
            toast(`Failed to reset password: ${pwdError.message}`, 'error');
            return;
          }
        }
      } catch (err: any) {
        toast(`Network error: ${err.message}`, 'error');
        return;
      }
    }

    await db.profiles.put(updatedProfile);
    await db.activity_logs.add({
      id: Date.now(),
      user_id: currentUser?.id,
      user_name: currentUser?.full_name,
      action: 'UPDATE',
      entity: 'profiles',
      entity_id: editingUser.id,
      summary: `Updated user profile ${updatedProfile.full_name} (${updatedProfile.role}, ${updatedProfile.is_active ? 'active' : 'inactive'})`,
      created_at: new Date().toISOString(),
    });

    toast(`Successfully updated user ${updatedProfile.full_name}`, 'success');
    setEditingUser(null);
    loadProfiles();
  };

  // 2. Change Role
  const handleRoleChange = async () => {
    if (!roleChangeUser) return;
    if (roleChangeUser.id === currentUser?.id) {
      toast('Admins cannot demote their own account', 'error');
      return;
    }

    if (isConfigured && navigator.onLine) {
      await supabase.from('profiles').update({ role: newRole }).eq('id', roleChangeUser.id);
    }
    await db.profiles.update(roleChangeUser.id, { role: newRole });
    await db.activity_logs.add({
      id: Date.now(),
      user_id: currentUser?.id,
      user_name: currentUser?.full_name,
      action: 'UPDATE',
      entity: 'profiles',
      entity_id: roleChangeUser.id,
      summary: `Changed role of ${roleChangeUser.full_name} to ${newRole}`,
      created_at: new Date().toISOString(),
    });

    toast(`Role updated to ${newRole}`, 'success');
    setRoleChangeUser(null);
    loadProfiles();
  };

  // 3. Toggle Active/Deactivated
  const handleToggleActive = async () => {
    if (!confirmToggleUser) return;
    if (confirmToggleUser.id === currentUser?.id) {
      toast('Admins cannot deactivate their own account', 'error');
      return;
    }

    const nextState = !confirmToggleUser.is_active;
    if (isConfigured && navigator.onLine) {
      await supabase.from('profiles').update({ is_active: nextState }).eq('id', confirmToggleUser.id);
    }
    await db.profiles.update(confirmToggleUser.id, { is_active: nextState });

    await db.activity_logs.add({
      id: Date.now(),
      user_id: currentUser?.id,
      user_name: currentUser?.full_name,
      action: 'UPDATE',
      entity: 'profiles',
      entity_id: confirmToggleUser.id,
      summary: `${nextState ? 'Reactivated' : 'Deactivated'} user ${confirmToggleUser.full_name}`,
      created_at: new Date().toISOString(),
    });

    toast(
      nextState
        ? `Reactivated ${confirmToggleUser.full_name}`
        : `Deactivated ${confirmToggleUser.full_name}`,
      'info'
    );
    setConfirmToggleUser(null);
    loadProfiles();
  };

  // 4. Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdUser || !newPassword) return;

    if (isConfigured && navigator.onLine) {
      const { error: rpcError } = await supabase.rpc('reset_user_password', {
        p_user_id: resetPwdUser.id,
        p_new_password: newPassword,
      });
      if (rpcError) {
        toast(`Failed to reset password: ${rpcError.message}`, 'error');
        return;
      }
    }

    await db.activity_logs.add({
      id: Date.now(),
      user_id: currentUser?.id,
      user_name: currentUser?.full_name,
      action: 'UPDATE',
      entity: 'profiles',
      entity_id: resetPwdUser.id,
      summary: `Reset password for ${resetPwdUser.full_name}`,
      created_at: new Date().toISOString(),
    });

    toast(`Password updated for ${resetPwdUser.full_name}`, 'success');
    setResetPwdUser(null);
    setNewPassword('');
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-surface border border-border rounded p-4 flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold text-text">User Management</h2>
          <p className="text-xs text-text-muted">Manage store staff, roles, and access credentials</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
          <UserPlus size={16} />
          <span>Create User</span>
        </Button>
      </div>

      {/* Users Table */}
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full Name</TableHead>
              <TableHead>Email Address</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => {
              const isSelf = p.id === currentUser?.id;

              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-text">
                    {p.full_name}
                    {isSelf && (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                        You
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-text-muted font-mono">
                    {p.email || 'offline-user'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded uppercase ${
                        p.role === 'admin'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                          : p.role === 'manager'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          : p.role === 'supervisor'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          : p.role === 'cashier'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {p.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded ${
                        p.is_active
                          ? 'bg-success-light text-success'
                          : 'bg-danger-light text-danger'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-text-muted">
                    {formatISTDateOnly(p.created_at || new Date().toISOString())}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Edit User Button */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEdit(p)}
                        className="min-h-[32px] py-1 text-xs text-accent hover:bg-accent-light gap-1"
                        title="Edit user profile, role, password or status"
                      >
                        <Edit3 size={13} />
                        <span>Edit</span>
                      </Button>

                      {/* Change Role Button */}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isSelf}
                        disabledReason="You cannot change your own role"
                        onClick={() => {
                          setRoleChangeUser(p);
                          setNewRole(p.role);
                        }}
                        className="min-h-[32px] py-1 text-xs"
                      >
                        <Shield size={12} />
                        <span>Role</span>
                      </Button>

                      {/* Reset Password Button */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setResetPwdUser(p);
                          setNewPassword('');
                        }}
                        className="min-h-[32px] py-1 text-xs"
                      >
                        <KeyRound size={12} />
                        <span>Reset Pwd</span>
                      </Button>

                      {/* Deactivate / Reactivate Button */}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isSelf}
                        disabledReason="You cannot deactivate your own account"
                        onClick={() => setConfirmToggleUser(p)}
                        className="min-h-[32px] py-1 text-xs"
                      >
                        {p.is_active ? <EyeOff size={12} /> : <Eye size={12} />}
                        <span>{p.is_active ? 'Deactivate' : 'Reactivate'}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* CREATE USER DIALOG */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New User Account"
        maxWidth="md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Full Name"
            value={createData.full_name}
            onChange={(e) => setCreateData({ ...createData, full_name: e.target.value })}
            placeholder="Karthik Pandian"
            required
            autoFocus
          />

          <Input
            label="Email Address"
            type="email"
            value={createData.email}
            onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
            placeholder="karthik@crackers.com"
            required
          />

          <Input
            label="Initial Password"
            type="password"
            value={createData.password}
            onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
            placeholder="Minimum 6 characters"
            required
          />

          <Select
            label="Role"
            value={createData.role}
            onChange={(e) => setCreateData({ ...createData, role: e.target.value as UserRole })}
          >
            <option value="admin">Admin (Full System Access & Settings)</option>
            <option value="manager">Manager (Bills Edit, Analytics & Reports)</option>
            <option value="supervisor">Supervisor (Bills Edit & Analytics)</option>
            <option value="cashier">Cashier (Billing & Receipts)</option>
            <option value="staff">Staff (Standard Billing & Products)</option>
          </Select>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create User
            </Button>
          </div>
        </form>
      </Dialog>

      {/* EDIT USER DIALOG */}
      {editingUser && (
        <Dialog
          isOpen={Boolean(editingUser)}
          onClose={() => setEditingUser(null)}
          title={`Edit User: ${editingUser.full_name}`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <Input
              label="Full Name"
              value={editFormData.full_name}
              onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
              placeholder="e.g. Karthik Pandian"
              required
              autoFocus
            />

            <Input
              label="Email Address"
              type="email"
              value={editFormData.email}
              onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
              placeholder="e.g. karthik@crackers.com"
              required
            />

            <Select
              label="Role"
              value={editFormData.role}
              disabled={editingUser.id === currentUser?.id}
              onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
            >
              <option value="admin">Admin (Full System Access & Settings)</option>
              <option value="manager">Manager (Bills Edit, Analytics & Reports)</option>
              <option value="supervisor">Supervisor (Bills Edit & Analytics)</option>
              <option value="cashier">Cashier (Billing & Receipts)</option>
              <option value="staff">Staff (Standard Billing & Products)</option>
            </Select>
            {editingUser.id === currentUser?.id && (
              <p className="text-[11px] text-text-muted -mt-2">
                * You cannot change your own admin role.
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="edit_user_active"
                checked={editFormData.is_active}
                disabled={editingUser.id === currentUser?.id}
                onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                className="w-4 h-4 text-accent border-border rounded focus:ring-accent"
              />
              <label htmlFor="edit_user_active" className="text-xs font-semibold text-text select-none cursor-pointer">
                Account Active (User can log in)
              </label>
            </div>

            <div className="pt-2 border-t border-border">
              <label className="block text-xs font-semibold text-text mb-1">
                New Password (Optional)
              </label>
              <Input
                type="password"
                value={editFormData.new_password}
                onChange={(e) => setEditFormData({ ...editFormData, new_password: e.target.value })}
                placeholder="Leave blank to keep current password"
              />
              <p className="text-[11px] text-text-muted mt-1">
                Enter only if you want to reset the user password immediately.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Changes
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* CHANGE ROLE DIALOG */}
      {roleChangeUser && (
        <Dialog
          isOpen={Boolean(roleChangeUser)}
          onClose={() => setRoleChangeUser(null)}
          title={`Change Role: ${roleChangeUser.full_name}`}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              Select the new access role for <strong>{roleChangeUser.full_name}</strong>.
            </p>
            <Select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="supervisor">Supervisor</option>
              <option value="cashier">Cashier</option>
              <option value="staff">Staff</option>
            </Select>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setRoleChangeUser(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleRoleChange}>
                Update Role
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* RESET PASSWORD DIALOG */}
      {resetPwdUser && (
        <Dialog
          isOpen={Boolean(resetPwdUser)}
          onClose={() => setResetPwdUser(null)}
          title={`Reset Password: ${resetPwdUser.full_name}`}
          maxWidth="sm"
        >
          <form onSubmit={handleResetPassword} className="space-y-4">
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="secondary" size="sm" onClick={() => setResetPwdUser(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Password
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* CONFIRM DEACTIVATE/REACTIVATE DIALOG */}
      {confirmToggleUser && (
        <Dialog
          isOpen={Boolean(confirmToggleUser)}
          onClose={() => setConfirmToggleUser(null)}
          title={confirmToggleUser.is_active ? 'Deactivate User Account' : 'Reactivate User Account'}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-text">
              Are you sure you want to {confirmToggleUser.is_active ? 'deactivate' : 'reactivate'}{' '}
              <strong>{confirmToggleUser.full_name}</strong>?
            </p>
            {confirmToggleUser.is_active && (
              <p className="text-xs text-danger">
                Deactivated users cannot log into the billing portal or perform operations.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setConfirmToggleUser(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmToggleUser.is_active ? 'danger' : 'primary'}
                size="sm"
                onClick={handleToggleActive}
              >
                Confirm {confirmToggleUser.is_active ? 'Deactivation' : 'Reactivation'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
