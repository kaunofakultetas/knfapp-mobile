import { useAuth } from '@/context/AuthContext';
import { fetchPoll, votePollApi, type PollResponse } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

export default function PollWidget({ postId }: { postId: string }) {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [poll, setPoll] = useState<PollResponse | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    fetchPoll(postId).then(setPoll);
  }, [postId]);

  if (!poll) return null;

  const handleVote = async (optionId: string) => {
    if (!isAuthenticated || voting) return;
    setVoting(true);
    try {
      const updated = await votePollApi(postId, optionId);
      setPoll(updated);
    } catch {
      // ignore
    } finally {
      setVoting(false);
    }
  };

  const hasVoted = !!poll.userVote;
  const total = poll.totalVotes || 1;

  return (
    <View className="mt-1 mb-2 px-2.5">
      <Text className="font-semibold text-base mb-2 px-0.5">{poll.title}</Text>
      {poll.options.map((option) => {
        const isSelected = poll.userVote === option.id;
        const pct = hasVoted ? Math.round((option.votes / total) * 100) : 0;
        return (
          <Pressable
            key={option.id}
            className={`h-10 mb-2 rounded-lg border-2 flex-row items-center overflow-hidden ${
              isSelected
                ? 'border-[#7B003F] bg-[#7B003F]/10'
                : hasVoted
                  ? 'border-gray-300 bg-gray-100'
                  : 'border-gray-400 bg-gray-200'
            }`}
            onPress={() => handleVote(option.id)}
            disabled={voting}
          >
            {hasVoted && (
              <View
                className={`absolute left-0 top-0 bottom-0 ${isSelected ? 'bg-[#7B003F]/20' : 'bg-gray-200'}`}
                style={{ width: `${pct}%` }}
              />
            )}
            <View className="flex-1 flex-row items-center justify-between px-3 z-10">
              <Text className={`font-medium ${isSelected ? 'text-[#7B003F]' : 'text-gray-800'}`}>
                {option.text}
              </Text>
              {hasVoted && (
                <View className="flex-row items-center gap-1">
                  <Text className={`text-sm ${isSelected ? 'font-bold text-[#7B003F]' : 'text-gray-500'}`}>
                    {pct}%
                  </Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={16} color="#7B003F" />}
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
      <Text className="text-xs text-gray-500 mt-1">
        {t('news.pollVotes', { count: poll.totalVotes })}
      </Text>
    </View>
  );
}
