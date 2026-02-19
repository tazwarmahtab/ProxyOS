'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SkinId, getSkin } from '@/lib/shared/skins';

export function useSkin() {
  const [activeSkinId, setActiveSkinId] = useState<SkinId>('default');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load active skin from Supabase user_preferences
    async function loadSkin() {
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('active_skin_id')
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned, which is fine for first-time users
          console.error('Error loading skin:', error);
        }

        if (data?.active_skin_id) {
          setActiveSkinId(data.active_skin_id as SkinId);
        }
      } catch (err) {
        console.error('Failed to load skin preference:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSkin();

    // Subscribe to changes
    const channel = supabase
      .channel('skin-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_preferences',
        },
        (payload) => {
          if (payload.new.active_skin_id) {
            setActiveSkinId(payload.new.active_skin_id as SkinId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const setSkin = async (skinId: SkinId) => {
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ id: 1, active_skin_id: skinId }, { onConflict: 'id' });

      if (error) throw error;
      setActiveSkinId(skinId);
    } catch (err) {
      console.error('Failed to set skin:', err);
      throw err;
    }
  };

  const activeSkin = getSkin(activeSkinId);

  return {
    activeSkinId,
    activeSkin,
    setSkin,
    loading,
  };
}
