import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Copy } from 'lucide-react';
import api from '../lib/api';

interface PatternForm {
  remote: string;
  pattern: string;
  series: string;
  season: string;
  language: string;
  quality: string;
  offset: number;
  releasegroup: string;
}

interface Series {
  title: string;
  seasons?: { seasonNumber: number; monitored: boolean }[];
}

export default function PatternEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
const [series, setSeries] = useState<Series[]>([]);
  const [rssItems, setRssItems] = useState<string[]>([]);
  const [proxyUrl, setProxyUrl] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PatternForm>({
    defaultValues: {
      language: 'Chinese',
      quality: 'WEBDL 1080p',
      offset: 0,
    },
  });

  const remote = watch('remote');
  const pattern = watch('pattern');

  useEffect(() => {
    loadSeries();
    if (id) loadPattern();
  }, [id]);

  useEffect(() => {
    if (!remote) {
      setRssItems([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(remote);
        const res = await api.get(`/proxy?url=${encoded}`);
        const xml = new DOMParser().parseFromString(res.data, 'text/xml');
        const items = Array.from(xml.querySelectorAll('item title')).map(
          (el) => el.textContent || ''
        );
        setRssItems(items.slice(0, 50));
      } catch {
        setRssItems([]);
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [remote]);

  useEffect(() => {
    if (!remote) {
      setProxyUrl('');
      return;
    }
    const base = window.location.origin;
    const path = new URL(remote).pathname;
    setProxyUrl(`${base}/RSS${path}?token=YOUR_TOKEN`);
  }, [remote]);

  const loadSeries = async () => {
    try {
      const res = await api.get('/sonarr/api/v3/series');
      setSeries(res.data);
    } catch {
      setSeries([]);
    }
  };

  const loadPattern = async () => {
    try {
      const res = await api.get(`/patterns/${id}`);
      const p = res.data;
      setValue('remote', p.remote || '');
      setValue('pattern', p.pattern);
      setValue('series', p.series);
      setValue('season', p.season);
      setValue('language', p.language);
      setValue('quality', p.quality);
      setValue('offset', p.offset || 0);
      setValue('releasegroup', p.releasegroup || '');
    } catch {
      navigate('/');
    }
  };

  const onSubmit = async (data: PatternForm) => {
    try {
      if (isEdit) {
        await api.put(`/patterns/${id}`, data);
      } else {
        await api.post('/patterns', data);
      }
      navigate('/');
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  const handleEscape = () => {
    const input = document.querySelector<HTMLTextAreaElement>('[name="pattern"]');
    if (input) {
      setValue('pattern', input.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
  };

  const handleCopyEpisode = () => {
    navigator.clipboard.writeText('(?<episode>\\d+)');
  };

  const handleSelectTitle = (title: string) => {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    setValue('pattern', escaped);
  };

  const matchedItems = useMemo(() => {
    if (!pattern || !rssItems.length) return [];
    try {
      const regex = new RegExp(`^${pattern}$`);
      return rssItems.map((title) => ({
        title,
        matched: regex.test(title),
      }));
    } catch {
      return rssItems.map((title) => ({ title, matched: false }));
    }
  }, [pattern, rssItems]);

  const seasonChoices = useMemo(() => {
    const selected = series.find((s) => s.title === watch('series'));
    return selected?.seasons?.map((s) => ({
      id: `${s.seasonNumber}`.padStart(2, '0'),
      ...s,
    })) || [];
  }, [series, watch('series')]);

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {isEdit ? 'Edit Pattern' : 'New Pattern'}
        </h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remote RSS URL
            </label>
            <input
              type="url"
              {...register('remote')}
              placeholder="https://mikanani.me/RSS/MyBangumi?token=xxx"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pattern (Regex)
            </label>
            <textarea
              {...register('pattern', { required: true })}
              rows={3}
              placeholder="\[Lilith-Raws\] (?<series>.+) - (?<episode>\d+) ..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleEscape}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
              >
                Escape
              </button>
              <button
                type="button"
                onClick={handleCopyEpisode}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
              >
                Episode
              </button>
            </div>
            {errors.pattern && (
              <p className="text-red-500 text-sm mt-1">Pattern is required</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Series
              </label>
              <select
                {...register('series', { required: true })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select series...</option>
                {series.map((s) => (
                  <option key={s.title} value={s.title}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Season
              </label>
              <select
                {...register('season', { required: true })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select season...</option>
                {seasonChoices.map((s) => (
                  <option key={s.id} value={s.id}>
                    Season {s.id}
                    {s.monitored ? '' : ' (unmonitored)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <input
                type="text"
                {...register('language')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quality
              </label>
              <input
                type="text"
                {...register('quality')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Offset
              </label>
              <input
                type="number"
                {...register('offset', { valueAsNumber: true })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Release Group
            </label>
            <input
              type="text"
              {...register('releasegroup')}
              placeholder="Lilith-Raws"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {proxyUrl && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700">
                  Proxy URL
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(proxyUrl)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <code className="text-xs text-blue-600 break-all">{proxyUrl}</code>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-6 py-2 text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {remote && (
        <div className="w-96">
          <div className="bg-white rounded-xl shadow p-4 sticky top-4">
            <h3 className="font-medium text-gray-900 mb-3">RSS Preview</h3>
            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {matchedItems.map((item, i) => (
                <div
                  key={i}
                  onClick={() => handleSelectTitle(item.title)}
                  className={`p-2 text-sm cursor-pointer rounded ${
                    item.matched
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  {item.title}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
