import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit, Trash2, RefreshCw } from 'lucide-react';
import api from '../lib/api';

interface Pattern {
  id: number;
  series: string;
  season: string;
  language: string;
  quality: string;
  releasegroup: string;
}

export default function PatternList() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadPatterns();
  }, []);

  const loadPatterns = async () => {
    try {
      const response = await api.get('/patterns');
      setPatterns(response.data);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this pattern?')) {
      await api.delete(`/patterns/${id}`);
      loadPatterns();
    }
  };

  const filteredPatterns = patterns.filter(
    (p) =>
      p.series.toLowerCase().includes(search.toLowerCase()) ||
      p.releasegroup?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Patterns</h2>
        <input
          type="text"
          placeholder="Search patterns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filteredPatterns.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No patterns found. Create your first one!
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Series
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Season
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Language
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Quality
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Release Group
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPatterns.map((pattern) => (
                <tr key={pattern.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {pattern.id}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {pattern.series}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {pattern.season}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        pattern.language === 'Chinese'
                          ? 'bg-red-100 text-red-700'
                          : pattern.language === 'Japanese'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {pattern.language}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                      {pattern.quality}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {pattern.releasegroup || '-'}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link
                      to={`/patterns/${pattern.id}`}
                      className="inline-flex items-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(pattern.id)}
                      className="inline-flex items-center p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
