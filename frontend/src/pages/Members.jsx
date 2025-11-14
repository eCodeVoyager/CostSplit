import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { membersAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../components/ui/use-toast';
import { ArrowLeft, UserPlus, Trash2, Users } from 'lucide-react';

export default function Members() {
  const [members, setMembers] = useState([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const response = await membersAPI.getAll();
      setMembers(response.data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch members',
        variant: 'destructive',
      });
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    setIsLoading(true);
    try {
      await membersAPI.create({ name: newMemberName.trim() });
      toast({
        title: 'Success',
        description: 'Member added successfully',
      });
      setNewMemberName('');
      fetchMembers();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add member',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMember = async (id, name) => {
    if (!confirm(`Are you sure you want to remove ${name}?`)) return;

    try {
      await membersAPI.delete(id);
      toast({
        title: 'Success',
        description: 'Member removed successfully',
      });
      fetchMembers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove member',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/dashboard">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Members</h1>
              <p className="text-sm text-muted-foreground">Manage group members</p>
            </div>
          </div>
        </div>

        {/* Add Member Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add New Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddMember} className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="memberName" className="sr-only">
                  Member Name
                </Label>
                <Input
                  id="memberName"
                  placeholder="Enter member name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" disabled={isLoading || !newMemberName.trim()}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Members List */}
        <Card>
          <CardHeader>
            <CardTitle>Group Members ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No members yet. Add your first member above!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member._id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center">
                        <span className="text-blue-700 font-semibold">
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium">{member.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMember(member._id, member.name)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
