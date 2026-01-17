import { prisma } from '@/lib/prisma';

export async function getVideoMetadataForUser(videoId: string, userId: string) {
  const video = await prisma.video.findFirst({
    where: { id: videoId, userId },
  });

  if (!video) {
    return null;
  }

  return {
    id: video.id,
    fileName: video.fileName,
    summary: video.summary,
    duration: video.duration,
    status: video.twelveLabsStatus,
    url: video.url,
  };
}

export async function listUploadedVideosForUser(userId: string) {
  const videos = await prisma.video.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return videos.map((video) => ({
    id: video.id,
    fileName: video.fileName,
    summary: video.summary,
    duration: video.duration,
    status: video.twelveLabsStatus,
    url: video.url,
  }));
}
