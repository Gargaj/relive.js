function ReliveByteStream( arrayBuffer )
{
  this.stream = new Uint8Array(arrayBuffer);
  this.offset = 0;

  this.uint8 = function()
  {
    return this.stream[this.offset++] & 0xFF;
  };
  
  this.uint16 = function()
  {
    var c = this.uint8();
    c |= this.uint8() << 8;
    return c;
  };
  
  this.uint32 = function()
  {
    var c = this.uint8();
    c |= this.uint8() << 8;
    c |= this.uint8() << 16;
    c |= this.uint8() << 24;
    return c;
  };
  
  this.string = function()
  {
    var length = this.uint16();
    var s = this.stream.subarray( this.offset, this.offset + length );
    this.offset += length;
    return decodeURIComponent(escape( String.fromCharCode.apply(null, s) ));
  };
};

function ReliveBinaryRequest(options) 
{
  var xhr = new XMLHttpRequest();
  xhr.open(options.method ? options.method : "GET", options.url, true);
  xhr.responseType = 'arraybuffer';
  
  xhr.onload = function(e) 
  {
    if (this.status == 200) 
    {
      if (options.success)
        options.success(this.response);
    }
  };
  
  xhr.send();
}

var Relive = Relive || {

  // if true, it will keep shoving all the data it finds into the Relive singleton
  // if false, the data will only be accessible through the success callbacks
  useSingleton: true, 
  
  TRACKTYPE_DEFAULT: 0,
  TRACKTYPE_MUSIC: 1,
  TRACKTYPE_TALK: 2,
  TRACKTYPE_JINGLE: 3,
  TRACKTYPE_NARRATION: 4,

  CHATTYPE_UNKNOWN: 0,
  CHATTYPE_MESSAGE: 1, 
  CHATTYPE_ME: 2, 
  CHATTYPE_JOIN: 3, 
  CHATTYPE_LEAVE: 4, 
  CHATTYPE_QUIT: 5, 
  CHATTYPE_NICK: 6, 
  CHATTYPE_TOPIC: 7, 
  CHATTYPE_MODE: 8, 
  CHATTYPE_KICK: 9,
  
  stations: {},
  
  loadStations:function( finished )
  {
    var _this = this;
    ReliveBinaryRequest({
      url: "http://stations.relive.nu/getstations/",
      method: "GET",
      success:function( arrayBuffer )
      {
        var stream = new ReliveByteStream( arrayBuffer );
        var size = stream.uint16();
        var packetID = stream.uint8(); //== 7
        var protocol = stream.uint8(); //== 1
        var stationCount = stream.uint32();
        console.log("stationCount = " + stationCount);
        _this.stations = {};
        for (var i = 0; i < stationCount; i++)
        {
          var size = stream.uint16();
          var packetID = stream.uint8(); //== 8
          var station = {};
          station.id = stream.uint32();
          station.port = stream.uint16();
          station.name = stream.string();
          station.domain = stream.string();
          station.path = stream.string();
          _this.stations[station.id] = station;
        }
        if (finished) finished( _this.stations );
      }
    });
  },
  loadStationInfo:function( stationID, finished )
  {
    var _this = this;
    if (!_this.stations[stationID])
      return;
    var url = "http://" + _this.stations[stationID].domain + ":" + _this.stations[stationID].port + _this.stations[stationID].path + "getstationinfo/?v=6";
    ReliveBinaryRequest({
      url: url,
      method: "GET",
      success:function( arrayBuffer )
      {
        var stream = new ReliveByteStream( arrayBuffer );
        var size = stream.uint16();
        var packetID = stream.uint8(); //== 1
        var version = stream.uint8();
        if ((version < 4) || (version > 6)) 
          return;
          
        var station = _this.stations[stationID];
        station.stationName = stream.string();
        
        if (version >= 5) station.websiteURL = stream.string();
        if (version >= 6) station.liveStreamURL = stream.string();
        
        var streamCount = stream.uint32();
        station.streams = {};
        for (var i = 0; i < streamCount; i++)
        {
          var size = stream.uint16();
          var packetID = stream.uint8(); //== 2
          var _stream = {};
          
          _stream.id = stream.uint32();
          _stream.timestamp = stream.uint32();
          _stream.length = stream.uint32();
          _stream.size = stream.uint32();
          
          _stream.format = stream.uint8();
          
          _stream.crcStreamInfo = stream.uint32();
          
          _stream.chatAvailable = (stream.uint8() != 0);
          
          _stream.crcChatData = stream.uint32();
          
          _stream.name = stream.string();
          _stream.host = stream.string();
          _stream.infoText = stream.string();
          
          station.streams[_stream.id] = _stream;
        }
        if (finished) finished( station );
      }
    });
  },
  loadStreamInfo:function( stationID, streamID, finished )
  {
    var _this = this;
    var _this = this;
    if (!_this.stations[stationID])
      return;
    if (!_this.stations[stationID].streams[streamID])
      return;
    var url = "http://" + _this.stations[stationID].domain + ":" + _this.stations[stationID].port + _this.stations[stationID].path + "getstreaminfo/" + 
      "?streamid=" + _this.stations[stationID].streams[streamID].id;
    ReliveBinaryRequest({
      url: url,
      method: "GET",
      success:function( arrayBuffer )
      {
        var stream = new ReliveByteStream( arrayBuffer );
        var size = stream.uint16();
        var packetID = stream.uint8(); //== 3
        var version = stream.uint8();
        if (version != 3 && version != 6) 
          return;
        
        var _stream = _this.useSingleton ? _this.stations[stationID].streams[streamID] : {};
        
        _stream.tracks = [];
        var trackCount = stream.uint32();
          
        for (var i = 0; i < trackCount; i++)
        {
          var track = {};
          var size = stream.uint16();
          var packetID = stream.uint8(); //== 4
          track.start = stream.uint32();
          track.id = stream.uint32();
          track.type = stream.uint8();
          track.infoAvailable = (stream.uint8() != 0);
          track.artist = stream.string();
          track.title = stream.string();
                   
          _stream.tracks.push( track );
        }
          
        if (finished) finished( _stream.tracks );
      }
    });
  },  
  loadStreamChat:function( stationID, streamID, finished )
  {
    var _this = this;
    if (!_this.stations[stationID])
      return;
    if (!_this.stations[stationID].streams[streamID])
      return;
    if (!_this.stations[stationID].streams[streamID].chatAvailable) // assuming this is always correct?
      return;
    var url = "http://" + _this.stations[stationID].domain + ":" + _this.stations[stationID].port + _this.stations[stationID].path + "getstreamchat/" + 
      "?streamid=" + _this.stations[stationID].streams[streamID].id;
    ReliveBinaryRequest({
      url: url,
      method: "GET",
      success:function( arrayBuffer )
      {
        var stream = new ReliveByteStream( arrayBuffer );
        var size = stream.uint16();
        var packetID = stream.uint8(); //== 5
        var version = stream.uint8();
        if (version < 2) 
          return;
        
        var _stream = _this.useSingleton ? _this.stations[stationID].streams[streamID] : {};
        
        _stream.channels = [];
        var channelCount = 1;
        if (version == 8)
          channelCount = stream.uint32();
          
        for (var i = 0; i < channelCount; i++)
        {
          var channel = {};
          channel.name = "";
          if( version >= 3 )
            channel.name = stream.string();
          
          var rowCount = stream.uint32();
          channel.rows = [];
          
          for (var j = 0; j < rowCount; j++)
          {
            var row = {};
            var size = stream.uint16();
            var packetID = stream.uint8(); //== 6
            row.timestamp = stream.uint32();
            row.type = stream.uint8();
            row.stringCount = stream.uint8();
            row.strings = [];
            for (var s = 0; s < row.stringCount; s++)
              row.strings.push( stream.string() );
            channel.rows.push( row );
          }
                   
          _stream.channels.push( channel );
        }
          
        if (finished) finished( _stream.channels );
      }
    });
  },  
  getStreamURL:function( stationID, streamID )
  {
    var _this = this;
    if (!_this.stations[stationID])
      return;
    if (!_this.stations[stationID].streams[streamID])
      return;
  
    var url = "http://" + _this.stations[stationID].domain + ":" + _this.stations[stationID].port + _this.stations[stationID].path + "getstreamdata/" + 
      "?streamid=" + _this.stations[stationID].streams[streamID].id +
      "&start=0" +
      "&length=" + _this.stations[stationID].streams[streamID].size;
    return url;
  },
  getStreamMimeType:function( stationID, streamID )
  {
    var _this = this;
    if (!_this.stations[stationID])
      return;
    if (!_this.stations[stationID].streams[streamID])
      return;

    switch(_this.stations[stationID].streams[streamID].format)
    {
      case 1: return "audio/mpeg";
      case 2: return "audio/ogg";
      case 3: return "audio/aac"; // not supported by html5 afaik?!
      default: return "application/octet-stream";
    }
    return null;
  },
};