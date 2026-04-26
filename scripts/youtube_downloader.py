#!/usr/bin/env python3
import sys
import json
import os

from pytubefix import YouTube
from pytubefix.fix_muxing import MuxingError
from pytubefix.exceptions import VideoUnavailable

def get_info(url):
    try:
        yt = YouTube(url)
        return {
            'success': True,
            'title': yt.title,
            'thumbnail': yt.thumbnail_url,
            'duration': yt.length,
            'author': yt.author,
            'views': yt.views,
            'video_id': yt.video_id
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def get_stream_itags(yt, resolution='1080p'):
    max_audio = 0
    audio_itag = None
    
    for stream in yt.streams.filter(only_audio=True):
        abr = int(stream.abr.replace('kbps', ''))
        if abr > max_audio:
            max_audio = abr
            audio_itag = stream.itag
    
    video_itag = None
    fps_found = 60
    
    try:
        video_stream = yt.streams.filter(res=resolution, fps=60).first()
        if video_stream:
            video_itag = video_stream.itag
        else:
            fps_found = 30
            video_stream = yt.streams.filter(res=resolution, fps=30).first()
            if video_stream:
                video_itag = video_stream.itag
            else:
                fps_found = 24
                video_stream = yt.streams.filter(res=resolution, fps=24).first()
                if video_stream:
                    video_itag = video_stream.itag
    except:
        pass
    
    if not video_itag:
        video_stream = yt.streams.filter(res=resolution).first()
        if video_stream:
            video_itag = video_stream.itag
            fps_found = video_stream.fps
    
    return audio_itag, video_itag, fps_found

def download(url, output_dir='./downloads', resolution='1080p', audio_only=False):
    try:
        yt = YouTube(url)
        output_path = os.path.join(output_dir, f"{yt.video_id}")
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        if audio_only:
            audio_stream = yt.streams.filter(only_audio=True).order_by('abr').desc().first()
            if audio_stream:
                audio_stream.download(output_path, filename=f"{yt.video_id}_audio")
                return {
                    'success': True,
                    'file': f"{output_path}/{yt.video_id}_audio.mp4",
                    'title': yt.title
                }
        
        audio_itag, video_itag, fps = get_stream_itags(yt, resolution)
        
        if video_itag:
            video_stream = yt.streams.get_by_itag(video_itag)
            audio_stream = yt.streams.get_by_itag(audio_itag)
            
            if audio_stream and video_stream:
                video_stream.download(output_path, filename=f"{yt.video_id}_video")
                audio_stream.download(output_path, filename=f"{yt.video_id}_audio")
                
                return {
                    'success': True,
                    'video_file': f"{output_path}/{yt.video_id}_video.mp4",
                    'audio_file': f"{output_path}/{yt.video_id}_audio.mp4",
                    'title': yt.title
                }
        
        stream = yt.streams.filter(res=resolution).first() or yt.streams.get_highest_resolution()
        file_path = stream.download(output_path)
        
        return {
            'success': True,
            'file': file_path,
            'title': yt.title
        }
        
    except VideoUnavailable:
        return {
            'success': False,
            'error': 'Video unavailable'
        }
    except MuxingError as e:
        return {
            'success': False,
            'error': f'Muxing error: {str(e)}'
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    command = sys.argv[1] if len(sys.argv) > 1 else 'info'
    url = sys.argv[2] if len(sys.argv) > 2 else ''
    
    if command == 'info':
        result = get_info(url)
    elif command == 'download':
        resolution = sys.argv[3] if len(sys.argv) > 3 else '1080p'
        audio_only = '--audio' in sys.argv
        result = download(url, resolution=resolution, audio_only=audio_only)
    else:
        result = {'success': False, 'error': 'Unknown command'}
    
    print(json.dumps(result))