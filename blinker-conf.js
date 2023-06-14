// module.exports = function(RED) {
//     function BlinkerConfNode(n) {
//         RED.nodes.createNode(this,n);
//         this.host = n.host;
//         this.port = n.port;
//     }
//     RED.nodes.registerType("blinker-conf",BlinkerConfNode);
// }

module.exports = (RED) => {
  RED.nodes.registerType('blinker-conf', class {
    constructor (config) {
      RED.nodes.createNode(this, config)
	  // console.log('blinker-conf.js',config)
      Object.assign(this, config)
    }
  })
}
