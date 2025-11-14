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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-6">
      <div className="container mx-auto px-3 py-4 sm:p-6 max-w-4xl">
        {/* Mobile-Optimized Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold">Members</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Manage group members</p>
            </div>
          </div>
        </div>

        {/* Mobile-Optimized Add Member Form */}
        <Card className="mb-4 sm:mb-6 shadow-sm">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
              Add New Member
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
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
                  className="h-11 sm:h-10 text-base"
                />
              </div>
              <Button
                type="submit"
                disabled={isLoading || !newMemberName.trim()}
                className="h-11 sm:h-10"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                <span className="text-base sm:text-sm">Add Member</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Mobile-Optimized Members List */}
        <Card className="shadow-sm">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Group Members ({members.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {members.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-base">No members yet. Add your first member above!</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {members.map((member) => (
                  <div
                    key={member._id}
                    className="flex items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm sm:text-base text-blue-700 font-semibold">
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium text-sm sm:text-base truncate">{member.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMember(member._id, member.name)}
                      className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 ml-2"
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
