// if we have crossdomain access, we can just return url, otherwise we need to use a proxy
function urlify(url)
{
  // return url;
  return "proxy.php?url=" + escape(url);
}

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
  
  xhr.onload = function(e) {
    if (this.status == 200) {
      if (options.success)
        options.success(xhr.response);
      //Do your stuff here
    }
  };
  
  xhr.send();
}

var Relive = {
  stations: {},
  initialize:function()
  {
    this.stations = {};
  },
  
  loadStations:function( finished )
  {
    var _this = this;
    ReliveBinaryRequest({
      url: urlify("http://stations.relive.nu/getstations/"),
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
  loadStationInfo:function( id, finished )
  {
    var _this = this;
    if (!_this.stations[id])
      return;
    var url = "http://" + _this.stations[id].domain + ":" + _this.stations[id].port + _this.stations[id].path + "getstationinfo/?v=6";
    ReliveBinaryRequest({
      url: urlify(url),
      method: "GET",
      success:function( arrayBuffer )
      {
        var stream = new ReliveByteStream( arrayBuffer );
        var size = stream.uint16();
        var packetID = stream.uint8(); //== 1
        var version = stream.uint8();
        if ((version < 4) || (version > 6)) 
          return;
          
        var station = _this.stations[id];
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